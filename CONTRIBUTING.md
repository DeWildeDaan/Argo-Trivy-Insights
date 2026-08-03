# Contributing to Argo Trivy Insights

Thanks for your interest! We welcome bug reports, feature requests, and pull requests.

## Reporting Issues

Found a bug or have a feature idea? [Open an issue](https://github.com/DeWildeDaan/argo-trivy-insights/issues/new) with:
- **Bug:** Steps to reproduce, expected vs. actual behavior, Argo CD version
- **Feature:** Use case and proposed solution

## Contributing to the project

1. **Fork and clone**
   ```bash
   git clone https://github.com/DeWildeDaan/argo-trivy-insights.git
   cd argo-trivy-insights
   npm install
   ```

2. **Create a branch**
   ```bash
   git checkout -b feature/my-feature
   ```

3. **Make your changes**
   - See [Development Guide](docs/DEVELOPMENT.md) for build commands and project structure
   - Keep changes focused — one feature or fix per PR

4. **Test**
   ```bash
   npm run typecheck  # Check types
   npm run build      # Test build succeeds
   npm run install:dev  # Test in running Argo CD (optional but recommended)
   ```

5. **Commit and push**
   ```bash
   git commit -m "Brief description of change"
   git push origin feature/my-feature
   ```

6. **Open a pull request**
   - Describe what changed and why
   - Link any related issues
   - If you where not able to test and render your changes locally on a workign ArgoCD instance, please mention so in the PR.

## Code Style

- Use TypeScript — no `any` without a comment explaining why
- Follow existing patterns in the codebase
- Keep components focused — extract large components into smaller ones
- Add comments only when the *why* isn't obvious from the code

## Running Locally

See [Development Guide](docs/DEVELOPMENT.md) for:
- Watch mode (`npm run dev`) + dev install (`npm run install:dev`)
- Project structure
- Adding a new report type

## Questions?

- Check existing [issues](https://github.com/DeWildeDaan/argo-trivy-insights/issues)
- Ask in a new issue with the `question` label

## License

By contributing, you agree your work is licensed under MIT (see [LICENSE](LICENSE)).
