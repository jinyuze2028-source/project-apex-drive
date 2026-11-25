# Releases and rollback

Contributors work on branches such as `feature/new-vehicle`, `feature/rally-track`, `fix/mirror-lag` and `fix/brake-light`. Merge reviewed contributions into `develop`, then promote them to `main` through an owner-reviewed pull request. In GitHub, check **Files changed**, review the tests and wait for **Build and test**. Approve via **Review changes**, then merge when GitHub's rules permit it. A reviewer cannot approve their own pull request.

Production is served at [Project Apex Drive](https://project-apex-drive-955.netlify.app/). The maintainer builds the approved main revision, verifies the candidate and publishes that build to the existing Netlify site. The public GitHub Actions workflow has no production credentials or deployment job. Netlify is currently managed by its existing explicit CLI deployment, independently of the public repository.

For a release, make sure the candidate includes the verified car assets and current credit files. Run `npm run build`, `npm test` and the headless smoke test against the preview. From a maintainer checkout linked to the existing site, run `netlify status` to verify the target and use `netlify deploy --dir=dist --no-build --prod`. Record the approved commit and deploy ID in a GitHub Release. For any future preview automation use a separate, unprivileged context. The previous deploy remains available for rollback.

To roll back, open the previous successful deploy in the Netlify project and select **Publish deploy**. The previous artifact is republished atomically at the existing URL. Verify the public site after the switch. [Netlify rollback instructions](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/#rollbacks)
