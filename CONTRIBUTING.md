# Contributing

We want this community to be friendly and respectful to each other. Please follow it in all your interactions with the project.

## Development workflow

To get started with the project, run `pnpm run` in the root directory to install the required dependencies for each package:

```sh
pnpm run
```

> Install [`pnpm`](https://pnpm.io/) first if you haven't already.

While developing, you can run the [example app](/examples/kitchen-sink/) to test your changes. Any changes you make in your library's JavaScript code will be reflected in the example app without a rebuild. If you change any native code, then you'll need to rebuild the example app.

To start the packager:

```sh
pnpm run example start
```

To run the example app on Android:

```sh
pnpm run example android
```

To run the example app on iOS:

```sh
pnpm run example ios
```

To run the example app on Web:

```sh
pnpm run example web
```

Make sure your code passes TypeScript, oxlint and oxfmt. Run the following to
verify:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format
```

To fix what can be fixed automatically, run the following:

```sh
pnpm run lint:fix
pnpm run format:fix
```

Remember to add tests for your change if possible. Run the unit tests by:

```sh
pnpm run test
```

### Commit message convention

We follow the [conventional commits specification](https://www.conventionalcommits.org/en) for our commit messages:

- `fix`: bug fixes, e.g. fix crash due to deprecated method.
- `feat`: new features, e.g. add new method to the module.
- `refactor`: code refactor, e.g. migrate from class components to hooks.
- `docs`: changes into documentation, e.g. add usage example for the module..
- `test`: adding or updating tests, e.g. add integration tests using detox.
- `chore`: tooling changes, e.g. change CI config.

Our pre-commit hooks verify that your commit message matches this format when committing.

### Linting and tests

[oxlint](https://oxc.rs/docs/guide/usage/linter), [oxfmt](https://oxc.rs/docs/guide/usage/formatter), [TypeScript](https://www.typescriptlang.org/)

We use [TypeScript](https://www.typescriptlang.org/) for type checking, [oxlint](https://oxc.rs/docs/guide/usage/linter) for linting and [oxfmt](https://oxc.rs/docs/guide/usage/formatter) for formatting, and [Jest](https://jestjs.io/) for testing. All three read their config from [GSTJ/magic](https://github.com/GSTJ/magic), which every GSTJ repo shares.

Our pre-commit hooks verify that the linter and tests pass when committing.

### Publishing to npm

We use [release-it](https://github.com/release-it/release-it) to make it easier to publish new versions. It handles common tasks like bumping version based on semver, creating tags and releases etc.

To publish new versions, run the following:

```sh
pnpm run release
```

### Scripts

The `package.json` file contains various scripts for common tasks:

- `pnpm run bootstrap`: setup project by installing all dependencies and pods.
- `pnpm run typecheck`: type-check files with TypeScript.
- `pnpm run lint`: lint files with oxlint.
- `pnpm run format`: check formatting with oxfmt.
- `pnpm run test`: run unit tests with Jest.
- `pnpm run example start`: start the Metro server for the example app.
- `pnpm run example android`: run the example app on Android.
- `pnpm run example ios`: run the example app on iOS.

### Sending a pull request

> **Working on your first pull request?** You can learn how from this _free_ series: [How to Contribute to an Open Source Project on GitHub](https://app.egghead.io/playlists/how-to-contribute-to-an-open-source-project-on-github).

When you're sending a pull request:

- Prefer small pull requests focused on one change.
- Verify that linters and tests are passing.
- Review the documentation to make sure it looks good.
- Follow the pull request template when opening a pull request.
- For pull requests that change the API or implementation, discuss with maintainers first by opening an issue.

## Code of Conduct

### Our Pledge

We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone, regardless of age, body size, visible or invisible disability, ethnicity, sex characteristics, gender identity and expression, level of experience, education, socio-economic status, nationality, personal appearance, race, religion, or sexual identity and orientation.

We pledge to act and interact in ways that contribute to an open, welcoming, diverse, inclusive, and healthy community.

### Our Standards

Examples of behavior that contributes to a positive environment for our community include:

- Demonstrating empathy and kindness toward other people
- Being respectful of differing opinions, viewpoints, and experiences
- Giving and gracefully accepting constructive feedback
- Accepting responsibility and apologizing to those affected by our mistakes, and learning from the experience
- Focusing on what is best not just for us as individuals, but for the overall community

Examples of unacceptable behavior include:

- The use of sexualized language or imagery, and sexual attention or
  advances of any kind
- Trolling, insulting or derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information, such as a physical or email
  address, without their explicit permission
- Other conduct which could reasonably be considered inappropriate in a
  professional setting

### Enforcement Responsibilities

Community leaders are responsible for clarifying and enforcing our standards of acceptable behavior and will take appropriate and fair corrective action in response to any behavior that they deem inappropriate, threatening, offensive, or harmful.

Community leaders have the right and responsibility to remove, edit, or reject comments, commits, code, wiki edits, issues, and other contributions that are not aligned to this Code of Conduct, and will communicate reasons for moderation decisions when appropriate.

### Scope

This Code of Conduct applies within all community spaces, and also applies when an individual is officially representing the community in public spaces. Examples of representing our community include using an official e-mail address, posting via an official social media account, or acting as an appointed representative at an online or offline event.

### Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be reported to the community leaders responsible for enforcement at [INSERT CONTACT METHOD]. All complaints will be reviewed and investigated promptly and fairly.

All community leaders are obligated to respect the privacy and security of the reporter of any incident.

### Enforcement Guidelines

Community leaders will follow these Community Impact Guidelines in determining the consequences for any action they deem in violation of this Code of Conduct:

#### 1. Correction

**Community Impact**: Use of inappropriate language or other behavior deemed unprofessional or unwelcome in the community.

**Consequence**: A private, written warning from community leaders, providing clarity around the nature of the violation and an explanation of why the behavior was inappropriate. A public apology may be requested.

#### 2. Warning

**Community Impact**: A violation through a single incident or series of actions.

**Consequence**: A warning with consequences for continued behavior. No interaction with the people involved, including unsolicited interaction with those enforcing the Code of Conduct, for a specified period of time. This includes avoiding interactions in community spaces as well as external channels like social media. Violating these terms may lead to a temporary or permanent ban.

#### 3. Temporary Ban

**Community Impact**: A serious violation of community standards, including sustained inappropriate behavior.

**Consequence**: A temporary ban from any sort of interaction or public communication with the community for a specified period of time. No public or private interaction with the people involved, including unsolicited interaction with those enforcing the Code of Conduct, is allowed during this period. Violating these terms may lead to a permanent ban.

#### 4. Permanent Ban

**Community Impact**: Demonstrating a pattern of violation of community standards, including sustained inappropriate behavior, harassment of an individual, or aggression toward or disparagement of classes of individuals.

**Consequence**: A permanent ban from any sort of public interaction within the community.

### Attribution

This Code of Conduct is adapted from the [Contributor Covenant][homepage], version 2.0,
available at https://www.contributor-covenant.org/version/2/0/code_of_conduct.html.

Community Impact Guidelines were inspired by [Mozilla's code of conduct enforcement ladder](https://github.com/mozilla/diversity).

[homepage]: https://www.contributor-covenant.org

For answers to common questions about this code of conduct, see the FAQ at
https://www.contributor-covenant.org/faq. Translations are available at https://www.contributor-covenant.org/translations.

## Local security patches

Picomatch 2.3.2 and 4.0.7 have no published fix for GHSA-fc5q-39xc-vjpf.
The local patches use the parser's literal fallback for repeated wildcard
operands and raw plus quantifiers and nested grammar without a proven safe reduction. This intentionally
narrows repeated extglob support in development tooling: unproved nested groups
and alternatives with overlapping initial characters now match literally.
Flat literal alternatives with disjoint initials under the active case matching
mode, fixed-width question marks, quoted stars,
POSIX character classes and the existing single-character star reduction stay
supported. The 2.3.2 reduction is restricted to one branch because its old
multi-branch form discards alternatives. Picomatch is not a runtime dependency
of the published modal package.

Run `pnpm run security:check` to verify the installed parser bytes, timeout-bound
regressions and every dependency path reported by the registry. New advisories,
unknown versions, unresolved paths and missing patches fail. `pnpm audit` keeps
the raw upstream advisory visible; these local mitigations do not resolve it.
