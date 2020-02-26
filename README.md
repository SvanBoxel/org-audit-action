# Organization Audit Action

GitHub Action that provides an Organization Audit. The output of this action is a publish CSV file in the Actions tab. The user can also configure the action to publish the results to an issue. The output looks like:

| org      | repo                   | user                  | permission | 
|----------|------------------------|-----------------------|------------| 
| octodemo | ReadingTimeDemo        | Nathan Henderson      | ADMIN      | 
| octodemo | ReadingTimeDemo        | Eric Johnson          | ADMIN      | 
| octodemo | ReadingTimeDemo        | Aziz Shamim           | ADMIN      | 
| octodemo | ReadingTimeDemo        | Brent Beer            | ADMIN      | 
| octodemo | ReadingTimeDemo        | Yuichi Tanaka         | ADMIN      | 
| octodemo | ReadingTimeDemo        | Chris Patterson       | WRITE      |

## Limitations

### Actions Rate Limits

> GitHub Actions can execute up to 1000 API requests in an hour across all actions within a repository

With this limitation in mind if your number of your repositories (R) times the number of users (U) is higher than 1000, the action will exit and print the results it hand until then. Take into account that you might be spending API calls with other actions within the hour.

### Archived Repositories

If you have archived repositories, the report will finish when it finds the first archived repository.

## Example workflows

Depending on your needs you might want to trigger the audit on different events. The simplest one to test it out is to trigger the workflow on push. For this workflow to run properly you'll need to provide it with a secret personal access token from someone that is an org owner or from an application that has that privilege. Providing it a lesser scope might not show all the information for the organization.

### Audit on push (for testing)

The `issue` is optional. 

```yml
on: push

jobs:
  
  audit_log:
    runs-on: ubuntu-latest
    name: Org Membership Audit Log
        
    - name: Org Membership Audit Log Action
      uses: actions/org-audit-action      
      with:
        org: 'octodemo'
        token: ${{ secrets.TOKEN }}
        issue: true
```

### Audit on a schedule (cron)

```yml
on:
  schedule:   
    # Once a week on Saturday 00:00
    - cron:  '0 0 * * 6'

jobs:
  
  audit_log:
    runs-on: ubuntu-latest
    name: Org Membership Audit Log
        
    - name: Org Membership Audit Log Action
      uses: actions/org-audit-action      
      with:
        org: 'octodemo'
        token: ${{ secrets.TOKEN }}
        issue: true
```

### Audit triggered by a an external service

Use a [`repository_dispatch`](https://developer.github.com/v3/repos/#create-a-repository-dispatch-event) event to trigger this workflow.

```yml
on: repository_dispatch
  
jobs:
  
  audit_log:
    runs-on: ubuntu-latest
    name: Org Membership Audit Log
        
    - name: Org Membership Audit Log Action
      uses: actions/org-audit-action      
      with:
        org: 'octodemo'
        token: ${{ secrets.TOKEN }}
        issue: true
```

## Help us improve it

Open an issue on: https://github.com/actions/org-audit-action
