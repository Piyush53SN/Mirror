# CI workflows

The two workflows that define "green" for this repository live here rather than in
`.github/workflows/` for one reason: the GitHub App used to push this branch has no
`workflows` permission, so a commit containing files under `.github/workflows/` is
rejected by GitHub before it reaches the branch.

They are real, final files — not drafts. To activate them, copy them into place
with a token that has the `workflows` permission (or through the GitHub web UI):

```bash
mkdir -p .github/workflows
cp infra/workflows/ci.yml infra/workflows/privacy-canary.yml .github/workflows/
git add .github/workflows && git commit -m "ci: activate workflows" && git push
```

Until that is done, `npm run verify` is the same check `ci.yml` runs, and `make
verify` is the local entry point. The canary workflow is `workflow_dispatch`-only
and checks for a build artifact before running, so it reports "not applicable"
rather than failing before P1/P5.
