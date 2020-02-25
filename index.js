const core = require('@actions/core');
const github = require('@actions/github');
const { graphql } = require("@octokit/graphql");

const main = async () => {
  const output = [];
  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `token ${process.env.TOKEN}`
    }
  });
  const { organization } = await graphqlWithAuth(`
    query ($organization: String!) {
      organization(login: $organization) {
        repositories (first: 10) {
          nodes {
            name
            collaborators(first: 10, affiliation: ALL) {
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
  `, {
    organization: 'octodemo',
  });
  console.log(organization)
}
try {
  main();
} catch (error) {
  core.setFailed(error.message);
}