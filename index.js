const core = require('@actions/core');
const github = require('@actions/github');
const { Octokit } = require('@octokit/rest');
const { graphql } = require("@octokit/graphql");

// const TIME_LIMIT = 60 * 1000; // seconds to milliseconds
// const start_time = new Date().getTime();

const MAX_API_CALLS = 50;
const token = `${core.getInput('TOKEN') || process.env.TOKEN}`


// setup octokit
// const octokit = new Octokit({
//   auth: token
// });

let finished_api_calls = 0;

const normalize_data = (data) => {
  return data;
}

class CollectUserData {
  constructor(token, organization, data) {
    this.initiateGraphQLClient(token)
    
    this.organization = organization; 
    this.result = data || null;
    this.totalAPICalls = 0;
  }

  initiateGraphQLClient(token) {
    this.graphqlClient = graphql.defaults({
      headers: {
        authorization: `token ${token}`
      }
    });
  }

  normalizeResult() {
    return this.result;
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
      organization: this.organization || core.getInput('org') || process.env.ORG,
      collaboratorsCursor,
      repositoriesCursor
    });

      return organization;
    } catch (error) {
      console.log("Request failed:", error.request); 
      console.log(error.message); 
    }
  }

  async collectData(collaboratorsCursor, repositoriesCursor) {
    const data = await this.requestData(collaboratorsCursor, repositoriesCursor);

    const repositoriesPage = data.repositories;
    const collaboratorsPage = data.repositories.nodes[0].collaborators;
    const currentRepository = repositoriesPage.nodes[0];
  
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
  
    if(finished_api_calls < MAX_API_CALLS) {
      this.normalize_data();
      return;
    }
  }
  
}
const main = async (data = null, collaboratorsCursor = null, repositoriesCursor = null) => {
  const token = core.getInput('token') || process.env.TOKEN;
  const org = core.getInput('org') || process.env.ORG;
  const Collector = new CollectUserData(token, org);
  await Collector.collectData();
}
try {
  main();
} catch (error) {
  core.setFailed(error.message);
}

