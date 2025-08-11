#!/bin/bash

# GitHub Labels Creation Script
# Run this to create all the recommended labels for the testing issues

echo "🏷️  Creating GitHub labels for testing and CI/CD improvements..."

# Priority Labels
echo "Creating priority labels..."
gh label create "priority-critical" --color "#FF0000" --description "Urgent issues requiring immediate attention" --force
gh label create "priority-high" --color "#FF8C00" --description "Important issues that should be addressed soon" --force
gh label create "priority-medium" --color "#FFD700" --description "Moderate priority issues" --force
gh label create "priority-low" --color "#32CD32" --description "Low priority nice-to-have features" --force

# Category Labels
echo "Creating category labels..."
gh label create "testing" --color "#0000FF" --description "Testing related issues" --force
gh label create "ci/cd" --color "#800080" --description "Continuous integration and deployment" --force
gh label create "infrastructure" --color "#000080" --description "Infrastructure and deployment setup" --force
gh label create "security" --color "#FF0000" --description "Security related issues" --force
gh label create "auth" --color "#00FFFF" --description "Authentication and authorization" --force
gh label create "e2e" --color "#FF00FF" --description "End-to-end testing" --force
gh label create "staging" --color "#FFA500" --description "Staging environment related" --force
gh label create "monitoring" --color "#FFFF00" --description "Monitoring and observability" --force
gh label create "database" --color "#008000" --description "Database related issues" --force
gh label create "tooling" --color "#808080" --description "Development and testing tools" --force
gh label create "automation" --color "#800080" --description "Automation and scripting" --force
gh label create "refactor" --color "#87CEEB" --description "Code refactoring and improvements" --force
gh label create "features" --color "#32CD32" --description "New feature implementation" --force
gh label create "workflows" --color "#32CD32" --description "User workflow testing" --force
gh label create "deployment" --color "#000080" --description "Deployment related issues" --force
gh label create "quality" --color "#FFD700" --description "Code quality improvements" --force

# Status Labels
echo "Creating status labels..."
gh label create "blocked" --color "#FF0000" --description "Issue is blocked by external dependency" --force
gh label create "in-progress" --color "#FFD700" --description "Issue is currently being worked on" --force
gh label create "ready-for-review" --color "#008000" --description "Ready for code review" --force
gh label create "needs-discussion" --color "#FFA500" --description "Needs team discussion before proceeding" --force

echo "✅ All labels created successfully!"
echo ""
echo "Next steps:"
echo "1. Review the labels in your GitHub repository"
echo "2. Create the issues using the markdown files"
echo "3. Assign appropriate labels to each issue"
echo ""
echo "To create an issue from a markdown file:"
echo "gh issue create --title 'Issue Title' --body-file ./issue-XX-filename.md --label 'label1,label2'"