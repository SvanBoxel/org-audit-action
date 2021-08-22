const MAX_COLLABORATORS_PER_CALL = 50;

const queries = {
  orgRepoAndCollaboratorQuery: `
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
            collaborators(first: ${MAX_COLLABORATORS_PER_CALL}, after: $collaboratorsCursor, affiliation: ALL) {
              pageInfo {
                endCursor
                hasNextPage
              }
              edges {
                node {
                  name
                  login
                }
                permission
              }
            }
          }
        }
      }
    }
  `,
  orgSAMLquery: `
    query ($organization: String!, $collaboratorsCursor: String, $repositoriesCursor: String) {
      organization(login: $organization) {
        samlIdentityProvider {
          externalIdentities(first: 100) {
            pageInfo {
              startCursor
              endCursor
              hasNextPage
            }
            edges {
              node {
                samlIdentity {
                  nameId
                }
                user {
                  login
                }
              }
            }
          }
        }
      }
    }
  `,
  enterpriseQuery: `
    query ($enterprise: String!) {
      enterprise(slug: $enterprise) {
        organizations(first: 100) {
          nodes {
            login
          }
        }
      }
    }
 `
};

module.exports = queries;
