const core = require('@actions/core');
const github = require('@actions/github');
const { graphql } = require("@octokit/graphql");

const main = async (data = null, collaboratorsCursor = null, repositoriesCursor = null) => {
  console.log(data);
  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `token ${process.env.TOKEN}`
    }
  });

  const { organization } = await graphqlWithAuth(`
    query ($organization: String!, $collaboratorsCursor: String, $repositoriesCursor: String) {
      organization(login: $organization) {
        repositories (first: 1, after: $repositoriesCursor) {
          pageInfo {
            endCursor
            hasNextPage
          }
          nodes {
            name
            collaborators(first: 100, after: $collaboratorsCursor, affiliation: ALL) {
              pageInfo {
                endCursor
                hasNextPage
              }
              edges {
                cursor
                node {
                  name
                  email
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
    organization: 'octodemo',
    collaboratorsCursor,
    repositoriesCursor
  });

  collaboratorsPage = organization.repositories.nodes[0].collaborators;

  while(collaboratorsPage.pageInfo.hasNextPage === true) {
    await main(
      organization, 
      collaboratorsPage.pageInfo.endCursor
    )
  }

  repositoriesPage = organization.repositories;
  while(repositoriesPage.pageInfo.hasNextPage === true) {
    await main(
      organization,
      null,
      repositoriesPage.pageInfo.endCursor
    )
  }
}
try {
  main();
} catch (error) {
  core.setFailed(error.message);
}

