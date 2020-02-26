const core = require('@actions/core');
const artifact = require('@actions/artifact');
const github = require('@actions/github');
const { graphql } = require("@octokit/graphql");
const fs = require('fs')

const MAX_API_CALLS = 5;
const ARTIFACT_FILE_NAME = 'raw-data.json';

class CollectUserData {


  constructor(token, organization, repository, data ) {
    this.initiateGraphQLClient(token);
    this.initiateOctokit(token);
    
    this.repository = repository;
    this.organization = organization; 
    this.result = data || null;
    this.totalAPICalls = 0;
    this.normalizedData = []

    this.postResultsToIssue();
  }
  
  async createArtifact() {
    if (!process.env.GITHUB_RUN_NUMBER) {
      return core.debug('not running in actions, skipping artifact upload')
    }

    const artifactClient = artifact.create()
    const artifactName = `user-report-${new Date().getTime()}`;
    const files = [ARTIFACT_FILE_NAME]
    const rootDirectory = './'
    const options = { continueOnError: true }

    const uploadResult = await artifactClient.uploadArtifact(artifactName, files, rootDirectory, options)
    console.log(uploadResult);
    return uploadResult;
  }

  async postResultsToIssue() {
    const [owner, repo] = this.repository.split('/');
    const { data: issue_response } = await this.octokit.issues.create({
      owner,
      repo,
      "title": `Audit log report for ${new Date().toLocaleString()}`,
      "body": 'test'
    });

    this.octokit.issues.update({
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
      this.totalAPICalls++;
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
      console.log("Request failed:", error.request); 
      console.log(error.message); 
    }
  }
  
  startCollection() {
    try {
      this.totalAPICalls = 0;
      this.collectData();
    } catch(err) {
      this.normalizeResult()
      process.exit()
    }
  }

  normalizeResult() {
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

    //console.log(this.normalizedData)
  }
  
  writeJSON() {
    try {
      fs.writeFileSync(`./${ARTIFACT_FILE_NAME}`, JSON.stringify(this.result), this.createArtifact)  
    } catch (err) {
      console.error(err)
    }
  }
  
  async collectData(collaboratorsCursor, repositoriesCursor) {
    const data = await this.requestData(collaboratorsCursor, repositoriesCursor);
    
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
      core.debug(`Still scanning ${currentRepository.name}, current member count: ${this.result.repositories.nodes[this.result.repositories.nodes.length -1].collaborators.edges.length}`);
    } else {
      core.debug(`Finished scanning ${this.result.repositories.nodes[this.result.repositories.nodes.length -1].name}, total number of members: ${this.result.repositories.nodes[this.result.repositories.nodes.length -1].collaborators.edges.length}`);
      this.result.repositories.nodes[this.result.repositories.nodes.length -1].previousCursor = repositoriesCursor;
      this.result.repositories.nodes = [
        ...this.result.repositories.nodes,
        currentRepository
      ]
    };
    
    if (this.totalAPICalls === MAX_API_CALLS) {
      this.writeJSON()
      process.exit();
    }
    
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
    }
      
    if(repositoriesPage.pageInfo.hasNextPage === true) {
      await this.collectData(
        null,
        repositoriesPage.pageInfo.endCursor
      )
    }
  }
}

const main = async () => {
  const token = core.getInput('token') || process.env.TOKEN;
  const org = core.getInput('org') || process.env.ORG;
  const Collector = new CollectUserData(token, org, process.env.GITHUB_REPOSITORY)
  await Collector.startCollection();
}

try {
  main();
} catch (error) {
  core.setFailed(error.message);
}
    
    