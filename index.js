const core = require('@actions/core');
const artifact = require('@actions/artifact');
const github = require('@actions/github');
const { graphql } = require("@octokit/graphql");
const csvToMarkdown = require('csv-to-markdown-table');
const fs = require('fs');
const os = require('os');

const { promisify } = require('util')

const writeFileAsync = promisify(fs.writeFile)

const ARTIFACT_FILE_NAME = 'raw-data';
const DATA_FOLDER = './data';
const ERROR_MESSAGE_ARCHIVED_REPO = "Must have push access to view repository collaborators."

!fs.existsSync(DATA_FOLDER) && fs.mkdirSync(DATA_FOLDER);

function JSONtoCSV(json) {
  var keys = ["org", "repo", "user", "permission"];
  var csv = keys.join(',') + os.EOL;
  
  json.forEach(function(record) {
		keys.forEach(function(_, i) {
			csv += record[i]
			if(i!=keys.length - 1) csv += ',';
		});
		csv += os.EOL;
  });
  
  return csv;
}

class CollectUserData {
  constructor(token, organization, repository, options) {
    this.initiateGraphQLClient(token);
    this.initiateOctokit(token);
    
    this.repository = repository;
    this.organization = organization;
    this.options = options; 
    this.result = options.data || null;
    this.normalizedData = []
  }
  
  async createandUploadArtifacts() {
    if (!process.env.GITHUB_RUN_NUMBER) {
      return core.debug('not running in actions, skipping artifact upload')
    }

    const artifactClient = artifact.create()
    const artifactName = `user-report-${new Date().getTime()}`;
    const files = [
      `./data/${ARTIFACT_FILE_NAME}.json`,
      `./data/${ARTIFACT_FILE_NAME}.csv`
    ]
    const rootDirectory = './'
    const options = { continueOnError: true }

    const uploadResult = await artifactClient.uploadArtifact(artifactName, files, rootDirectory, options)
    return uploadResult;
  }

  async postResultsToIssue(csv) {
    console.log(this.options)
    if (!this.options.postToIssue) {
      return core.info(`Skipping posting result to issue ${this.repository}.`);
    }

    const [owner, repo] = this.repository.split('/');
    let body = await csvToMarkdown(csv, ",", true)

    core.info(`Posting result to issue ${this.repository}.`);
    const { data: issue_response } = await this.octokit.issues.create({
      owner,
      repo,
      "title": `Audit log report for ${new Date().toLocaleString()}`,
      "body": body
    });

    core.info(issue_response);
    await this.octokit.issues.update({
      owner,
      repo,
      "issue_number" : issue_response.number,
      "state": "closed"
    });
  }

  initiateGraphQLClient(token) {
    this.graphqlClient = graphql.defaults({
      headers: {
        authorization: `token ${token}`
      }
    });
  }

  initiateOctokit(token) {
    this.octokit = new github.GitHub(token);
  }
  
  async requestData (collaboratorsCursor = null, repositoriesCursor = null) {
    try {
      const { organization } = await this.graphqlClient(`
      query ($organization: String!, $collaboratorsCursor: String, $repositoriesCursor: String) {
        organization(login: $organization) {
          repositories (first: 1, after: $repositoriesCursor) {
            pageInfo {
              startCursor
              endCursor
              hasNextPage
            }
            nodes {
              name
              collaborators(first: 50, after: $collaboratorsCursor, affiliation: ALL) {
                pageInfo {
                  endCursor
                  hasNextPage
                }
                edges {
                  node {
                    name
                  }
                  permission
                }
              }
            }
          }
        }
      }
      `, 
      {
        organization: this.organization,
        collaboratorsCursor,
        repositoriesCursor
      });
      
      return organization;
    } catch (error) {
      // console.log("Request failed:", error.request); 
      // console.log(error.message); 
      if (error && error.message == ERROR_MESSAGE_ARCHIVED_REPO) {
        //console.log(error.data.organization.nodes)
        core.info(`⏸ Skipping archived repository ${error.data.organization.repositories.nodes[0].name}`);  
        let data = await this.requestData(null, error.data.organization.repositories.pageInfo.endCursor)        
        return data
      }
      return null;
    }
  }
  
  async startCollection() {
    core.info(`Start collecting for ${this.organization}.`);
    try {
      this.collectData();
    } catch(err) {
      await this.endCollection();
    }
  }

  async endCollection() {
    this.normalizeResult();
    const json = this.normalizedData;
    const csv = JSONtoCSV(json);

    await writeFileAsync(`${DATA_FOLDER}/${ARTIFACT_FILE_NAME}.json`, JSON.stringify(json))
    await writeFileAsync(`${DATA_FOLDER}/${ARTIFACT_FILE_NAME}.csv`, JSON.stringify(csv))

    await this.createandUploadArtifacts();
    await this.postResultsToIssue(csv)
    process.exit();
  }

  normalizeResult() {
    core.info(`Normalizing result.`);
    this.result.repositories.nodes.forEach(repository => {        
      repository.collaborators.edges.forEach( collaborator => {
        this.normalizedData.push([
          this.organization,
          repository.name,
          collaborator.node.name,
          collaborator.permission 
        ])
      })        
    })
  }
  
  async collectData(collaboratorsCursor, repositoriesCursor) {
    const data = await this.requestData(collaboratorsCursor, repositoriesCursor);

    if(!data) {
      await this.endCollection();
    }

    const repositoriesPage = data.repositories;
    const currentRepository = repositoriesPage.nodes[0];
    const collaboratorsPage = currentRepository.collaborators;
    
    if (!this.result) {
      this.result = data;
    } else if (this.result && currentRepository.name === this.result.repositories.nodes[this.result.repositories.nodes.length - 1].name) {
      this.result.repositories.nodes[this.result.repositories.nodes.length -1].collaborators.edges = [
        ...this.result.repositories.nodes[this.result.repositories.nodes.length -1].collaborators.edges,
        ...collaboratorsPage.edges
      ]
      core.info(`⏳ Still scanning ${currentRepository.name}, current member count: ${this.result.repositories.nodes[this.result.repositories.nodes.length -1].collaborators.edges.length}`);
    } else {
      core.info(`✅ Finished scanning ${this.result.repositories.nodes[this.result.repositories.nodes.length -1].name}, total number of members: ${this.result.repositories.nodes[this.result.repositories.nodes.length -1].collaborators.edges.length}`);
      this.result.repositories.nodes[this.result.repositories.nodes.length -1].previousCursor = repositoriesCursor;
      this.result.repositories.nodes = [
        ...this.result.repositories.nodes,
        currentRepository
      ]
    };
    
    if(collaboratorsPage.pageInfo.hasNextPage === true) {
      let repoStartCursor = null;
      if (collaboratorsPage.pageInfo.hasNextPage, this.result.repositories.nodes.length === 1) {
        repoStartCursor = null;
      } else {
        repoStartCursor = this.result.repositories.nodes[this.result.repositories.nodes.length -2].previousCursor;
      }
      await this.collectData(
        collaboratorsPage.pageInfo.endCursor,
        repoStartCursor
      )
      return;
    }
      
    if(repositoriesPage.pageInfo.hasNextPage === true) {
      await this.collectData(
        null,
        repositoriesPage.pageInfo.endCursor
      )
      return;
    }

    this.endCollection();
  }
}

const main = async () => {
  const token = core.getInput('token') || process.env.TOKEN;
  const org = core.getInput('org') || process.env.ORG;
  const Collector = new CollectUserData(token, org, process.env.GITHUB_REPOSITORY, {
    postToIssue: core.getInput('issue') || process.env.ISSUE 
  })
  await Collector.startCollection();
}

try {
  main();
} catch (error) {
  core.setFailed(error.message);
}