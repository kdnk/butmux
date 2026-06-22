# Agent Instructions

## Version Control

- Use GitButler (`but`) for version control operations in this repository.
- Do not use direct `git` write operations such as `git add`, `git commit`, `git checkout`, `git merge`, `git rebase`, or `git push` unless the user explicitly changes this policy.
- Read-only `git` inspection commands are allowed when they are useful.

## GitHub

- Do not access GitHub URLs directly.
- Use the `gh` CLI for GitHub operations.

## Commits

- Follow Conventional Commits.
- Write commit messages in English.
- Include a thoughtful commit description that explains both Why and What.

## Maintaining This File

- When work reveals instructions, constraints, or procedures that will be continuously useful for future AI agents, update this file autonomously.
- Do not add temporary circumstances, guesses, one-off notes, or instructions that conflict with existing guidance.
- Ask the user before changing or deleting existing instructions.
- If this file is edited, mention the change in the final report.
