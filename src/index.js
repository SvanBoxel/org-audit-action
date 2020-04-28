const core = require("@actions/core");
const artifact = require("@actions/artifact");
const github = require("@actions/github");
const { graphql } = require("@octokit/graphql");
const csvToMarkdown = require("csv-to-markdown-table");
const fs = require("fs");
const { promisify } = require("util");

const { JSONtoCSV } = require("./utils");
const { organizationQuery, enterpriseQuery } = require("./queries");

const writeFileAsync = promisify(fs.writeFile);

const ARTIFACT_FILE_NAME = "raw-data";
const DATA_FOLDER = "./data";
const ERROR_MESSAGE_ARCHIVED_REPO =
  "Must have push access to view repository collaborators.";
const ERROR_MESSAGE_TOKEN_UNAUTHORIZED =
  "Resource protected by organization SAML enforcement. You must grant your personal token access to this organization.";

!fs.existsSync(DATA_FOLDER) && fs.mkdirSync(DATA_FOLDER);

class CollectUserData {
  constructor(token, organization, enterprise, samlIdentities, options ) {
    this.validateInput(organization, enterprise);

    this.organizations = [{ login: organization }];
    this.enterprise = enterprise;
    this.options = options;
    this.result = options.data || {};
    this.normalizedData = [];
    this.trackedLastRepoCursor = null;
    this.samlIdentities = samlIdentities;

    this.initiateGraphQLClient(token);
    this.initiateOctokit(token);
  }

  validateInput(organization, enterprise) {
    if (organization && enterprise) {
      core.setFailed(
        "The organization and enterprise parameter are mutually exclusive."
      );
      process.exit();
    }
  }

  async createandUploadArtifacts() {
    if (!process.env.GITHUB_RUN_NUMBER) {
      return core.debug("not running in actions, skipping artifact upload");
    }

    const artifactClient = artifact.create();
    const artifactName = `user-report-${new Date().getTime()}`;
    const files = [
      `./data/${ARTIFACT_FILE_NAME}.json`,
      `./data/${ARTIFACT_FILE_NAME}.csv`
    ];
    const rootDirectory = "./";
    const options = { continueOnError: true };

    const uploadResult = await artifactClient.uploadArtifact(
      artifactName,
      files,
      rootDirectory,
      options
    );
    return uploadResult;
  }

  async postResultsToIssue(csv) {
    if (!this.options.postToIssue) {
      return core.info(
        `Skipping posting result to issue ${this.options.repository}.`
      );
    }

    const [owner, repo] = this.options.repository.split("/");
    const reportType = this.enterprise ? "Enterprise" : "Organization";

    let body = await csvToMarkdown(csv, ",", true);

    core.info(`Posting result to issue ${this.options.repository}.`);
    const { data: issue_response } = await this.octokit.issues.create({
      owner,
      repo,
      title: `${reportType} audit log report for ${new Date().toLocaleString()}`,
      body: body
    });

    core.info(issue_response);
    await this.octokit.issues.update({
      owner,
      repo,
      issue_number: issue_response.number,
      state: "closed"
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

  async requestEnterpriseData() {
    const { enterprise } = await this.graphqlClient(enterpriseQuery, {
      enterprise: this.enterprise
    });
    return enterprise;
  }

  async requestOrganizationData(
    organization,
    collaboratorsCursor = null,
    repositoriesCursor = null
  ) {
    const { organization: data } = await this.graphqlClient(organizationQuery, {
      organization,
      collaboratorsCursor,
      repositoriesCursor
    });

    return data;
  }

  async collectData(organization, collaboratorsCursor, repositoriesCursor) {
    let data;
    try {
      data = await this.requestOrganizationData(
        organization,
        collaboratorsCursor,
        repositoriesCursor
      );
    } catch (error) {
      if (error.message === ERROR_MESSAGE_TOKEN_UNAUTHORIZED) {
        core.info(
          `⏸  The token you use isn't authorized to be used with ${organization}`
        );
        return null;
      }
      if (error.message == ERROR_MESSAGE_ARCHIVED_REPO) {
        core.info(
          `⏸  Skipping archived repository ${error.data.organization.repositories.nodes[0].name}`
        );
        await this.collectData(
          organization,
          null,
          error.data.organization.repositories.pageInfo.endCursor
        );
        return;
      }
    } finally {
      if (!data || !data.repositories.nodes.length) {
        core.info(
          `⏸  No data found for ${organization}, probably you don't have the right permission`
        );
        return;
      }

      const repositoriesPage = data.repositories;
      const currentRepository = repositoriesPage.nodes[0];
      const collaboratorsPage = currentRepository.collaborators;
      let result;
      if (!this.result[organization]) {
        result = this.result[organization] = data;
        this.trackedLastRepoCursor = repositoriesCursor;
      } else {
        result = this.result[organization];

        const repositoriesInResult = result.repositories.nodes.length;
        const lastRepositoryInResult =
          result.repositories.nodes[repositoriesInResult - 1];

        if (result && currentRepository.name === lastRepositoryInResult.name) {
          lastRepositoryInResult.collaborators.edges = [
            ...lastRepositoryInResult.collaborators.edges,
            ...collaboratorsPage.edges
          ];
        } else {
          this.trackedLastRepoCursor = repositoriesCursor;
          result.repositories.nodes = [
            ...result.repositories.nodes,
            currentRepository
          ];
        }
      }

      this.result[organization] = result;

      if (collaboratorsPage.pageInfo.hasNextPage === true) {
        let repoStartCursor = this.trackedLastRepoCursor;
        core.info(
          `⏳ Still scanning ${currentRepository.name}, current member count: ${
            result.repositories.nodes[result.repositories.nodes.length - 1]
              .collaborators.edges.length
          }`
        );
        await this.collectData(
          organization,
          collaboratorsPage.pageInfo.endCursor,
          repoStartCursor
        );
        return;
      }
      core.info(
        `✅ Finished scanning ${
          result.repositories.nodes[result.repositories.nodes.length - 1].name
        }, total number of members: ${
          result.repositories.nodes[result.repositories.nodes.length - 1]
            .collaborators.edges.length
        }`
      );

      if (repositoriesPage.pageInfo.hasNextPage === true) {
        await this.collectData(
          organization,
          null,
          repositoriesPage.pageInfo.endCursor
        );
        return;
      }

      return this.result[organization];
    }
  }

  async startCollection() {
    if (this.enterprise) {
      const enterpriseData = await this.requestEnterpriseData();
      this.organizations = enterpriseData.organizations.nodes;
    }

    try {
      for (const { login } of this.organizations) {
        core.startGroup(`🔍 Start collecting for organization ${login}.`);
        this.result[login] = null;
        await this.collectData(login);

        if (this.result[login]) {
          core.info(
            `✅ Finished collecting for organization ${login}, total number of repos: ${this.result[login].repositories.nodes.length}`
          );
          core.endGroup();
        }
      }

      await this.endCollection();
    } catch (err) {
      console.log(err);
      await this.endCollection();
    }
  }

  async endCollection() {
    this.normalizeResult();
    const json = this.normalizedData;

    if (!json.length) {
      return core.setFailed(`⚠️  No data collected. Stopping action`);
    }

    const csv = JSONtoCSV(json);

    await writeFileAsync(
      `${DATA_FOLDER}/${ARTIFACT_FILE_NAME}.json`,
      JSON.stringify(json)
    );
    await writeFileAsync(
      `${DATA_FOLDER}/${ARTIFACT_FILE_NAME}.csv`,
      csv
    );

    await this.createandUploadArtifacts();
    await this.postResultsToIssue(csv);
    process.exit();
  }

  normalizeResult() {
    core.info(`⚛  Normalizing result.`);
    Object.keys(this.result).forEach(organization => {
      if (
        !this.result[organization] ||
        !this.result[organization].repositories
      ) {
        return;
      }
      let useSamlIdentities = false;
      // if samlIdentities:true is specified and samlIdentities exist for the organization ...
      if (this.samlIdentities == "true" && this.result[organization].samlIdentityProvider) {
        useSamlIdentities = true;
      }
      //TODO: find the correct plact for this error
      if (this.samlIdentities == "true" && !this.result[organization].samlIdentityProvider) {
        core.info(
          `⏸  No SAML Identities found for ${organization}, SAML SSO is either not configured or no member accounts are linked to your SAML IdP`
        );
      }

      let externalIdentities;
      if (useSamlIdentities == true) {
        externalIdentities = this.result[organization].samlIdentityProvider.externalIdentities;
      }
      this.result[organization].repositories.nodes.forEach(repository => {
        if (!repository.collaborators.edges) {
          return;
        }

        repository.collaborators.edges.forEach(collaborator => {
          // map collaborator login to samlIdentity
          let samlIdentity;
          if (useSamlIdentities == true) {
            samlIdentity = "";
            externalIdentities.edges.forEach(identity => {
              if (identity.node.user.login == collaborator.node.login) {
                  samlIdentity = identity.node.samlIdentity.nameId;
              }
            })
          }

          this.normalizedData.push({
            ...(this.enterprise ? { enterprise: this.enterprise } : null),
            organization,
            repository: repository.name,
            name: collaborator.node.name,
            login: collaborator.node.login,
            ...((useSamlIdentities == true) ? { samlIdentity: samlIdentity } : null),
            permission: collaborator.permission
          });
        });
      });
    });
  }
}

const main = async () => {
  const token = core.getInput("token") || process.env.TOKEN;
  const organization = core.getInput("organization") || process.env.ORGANIZATION;
  const enterprise = core.getInput("enterprise") || process.env.ENTERPRISE;
  const samlIdentities = core.getInput("samlIdentities") || process.env.samlIdentities

  const Collector = new CollectUserData(token, organization, enterprise, samlIdentities, {
    repository: process.env.GITHUB_REPOSITORY,
    postToIssue: core.getInput("issue") || process.env.ISSUE
  });
  await Collector.startCollection();
};

try {
  main();
} catch (error) {
  core.setFailed(error.message);
}
