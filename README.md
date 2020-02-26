# Organization Audit Action

GitHub Action that provides an Organization Audit. The output of this action is a publish CSV file in the Actions tab. The user can also configure the action to publish the results to an issue. The output looks like:

| Organization | User      | Repository        | Permission |
|--------------|-----------|-------------------|------------|
| octodemo     | bitoiu    | action-frameworks | admin      |
| octodemo     | bitoiu    | sensitive-repo    | read       |
| octodemo     | svanboxel | action-frameworks | wrote      |


## Limitations

> GitHub Actions can execute up to 1000 API requests in an hour across all actions within a repository

With this limitation in mind if your number of your repositories (R) times the number of users (U) is higher than 1000, the action will exit and print the results it hand until then. Take into account that you might be spending API calls with other actions within the hour.

## Installation

## Help us improve it


