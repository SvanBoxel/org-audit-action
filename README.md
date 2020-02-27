# GitHub Membership Audit Action

GitHub Action that provides an Enterprise Account or Organization Audit of members, repositories and which have these have. The output of this action is a published CSV file in the Actions tab. The user can also configure the action to publish the results to an issue. 

The output looks like this running on `enterprise` mode:

| enterprise | organization | repo             | user             | login      | permission |   |
|------------|--------------|------------------|------------------|------------|------------|---|
| goodcorp   | goodcorp-os  | node-utils       | Vitor Monteiro   | bitoiu     | ADMIN      |   |
| goodcorp   | goodcorp-os  | node-utils       | Richard Erwin    | rerwinx    | ADMIN      |   |
| goodcorp   | goodcorp-os  | node-utils       | Kai Hilton-Jones | evil-clone | WRITE      |   |
| goodcorp   | core         | innersource-docs | Vitor Monteiro   | bitoiu     | ADMIN      |   |
| goodcorp   | core         | innersource-docs | Richard Erwin    | rerwinx    | READ       |   |


## Example workflows

Depending on your needs you might want to trigger the audit on different events. The simplest one to test it out is to trigger the workflow on push. For this workflow to run properly you'll need to provide it with a secret personal access token from someone that is an org owner or from an application that has that privilege. Providing it a lesser scope might not show all the information for the organization.

### Single org-audit audit on push (good for testing)

The action in the following workflow is configured to:
 - Work only on a single `organization`
 - Publish results also to an `issue`

```yml
on: push

jobs:
  
  audit_log:
    runs-on: ubuntu-latest
    name: Membership Audit Log
        
    - name: Membership Audit Log Action
      uses: svanboxel/org-audit-action@v1
      with:
        organization: 'octodemov2'
        token: ${{ secrets.TOKEN }}
        issue: true
```

### Enterprise Account audit on a schedule (cron)

The action in the following workflow is configured to:
 - Work on an `enterprise` account
 - Publish results also to an `issue`

```yml
on:
  schedule:   
    # Once a week on Saturday 00:00
    - cron:  '0 0 * * 6'

jobs:
  
  audit_log:
    runs-on: ubuntu-latest
    name: Membership Audit Log
        
    - name: Membership Audit Log Action
      uses: svanboxel/org-audit-action@v1
      with:
        enterprise: 'goodcorp'
        token: ${{ secrets.TOKEN }}
        issue: true
```

### Enterprise Audit triggered by an external service

Use a [`repository_dispatch`](https://developer.github.com/v3/repos/#create-a-repository-dispatch-event) event to trigger this workflow. The action in the following workflow is configured to:
 - Work on an `enterprise` account
 - Publish results also to an `issue`

```yml
on: repository_dispatch
  
jobs:
  
  audit_log:
    runs-on: ubuntu-latest
    name: Membership Audit Log
        
    - name: Membership Audit Log Action
      uses: svanboxel/org-audit-action@v1
      with:
        enterprise: 'goodcorp'
        token: ${{ secrets.TOKEN }}
        issue: true
```

## Help us improve it

Open an issue on: https://github.com/svanboxel/org-audit-action
