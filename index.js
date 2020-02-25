const core = require('@actions/core');
const github = require('@actions/github');

try {
  const orgName = core.getInput('org');
  console.log(`Org input: ${orgName}!`);  
  core.setOutput("org", orgName);
} catch (error) {
  core.setFailed(error.message);
}