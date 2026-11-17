# Incident: injected backdoor in build config files (Sept–Nov 2026)

**Status:** repo cleaned on `feat/upgrade-client-approvals-and-tasks-flow` (2026-11-16). Developer machine and credentials **not yet remediated**: see the checklist below.

## What happened

An obfuscated loader was appended to the end of an existing line in build
config files, padded with hundreds of spaces so it sat off-screen in editors
and most diff views:

| File | First seen | Notes |
|---|---|---|
| `apps/binx-web/postcss.config.mjs` | `622d15b` (2026-09-22) | also gained an `import { createRequire }` prelude |
| `apps/binx-mobile/eslint.config.js` | `622d15b` (2026-09-22) | app since removed (`f4fa971`) |

It was removed once in `92b5f52` ("Bad Code injection fix", 2026-10-30), was
**back the next day** in `e82d161`, and was committed again in `14fe18f`
(2026-11-08). Re-infection means the source is still active on the dev
machine, not in the repo.

`master` carried it between `b29db80` (2026-10-29) and `92b5f52`
(2026-10-30), so any deploy in that window ran it during the Docker `next build`.
`origin/master` is clean today, but **~40 other remote branches still
contain the payload**. Running or merging any of them re-executes it.

## What the payload does (statically decoded, never executed)

1. Puts Node's `require`, `module`, `__dirname` and `__filename` on `global`.
2. Rate-limits itself to one run per 30 s via `global._p_t`.
3. Uses JSON-RPC against public Ethereum nodes to find a transaction from a
   wallet containing `596dcc9fda875309ff85eba09cf5a97d`, which points to data
   stored in BNB Smart Chain transactions.
4. Reads that transaction's input, XOR-decrypts it with the key
   `8l%Sljl>J>U61O,n`, and **`eval`s it** with full Node privileges.

This is a blockchain-hosted ("EtherHiding"-style) loader: the code that
actually runs is whatever the attacker last posted on-chain, and it can
change at any time. Assume it was a credential/wallet stealer that also
re-injected repos on disk, because that is what this family does and it
explains the re-infection.

It ran on every load of the PostCSS config: `next dev`, `next build`,
`vitest` (`css: true`), the Tailwind IDE extension, and CI/deploy builds.

### Indicators of compromise

- Strings: `global.o='8-hhn10697'`, `_$jsoPow`, `_$jsoIter`, `global[_$_6a5e[`,
  `String.fromCharCode(127)` shuffle decoder, `['constructor']` Function call.
- Network (from a Node process): `ethereum-rpc.publicnode.com`, `eth.drpc.org`,
  `eth-mainnet.public.blastapi.io`, `rpc.mevblocker.io`,
  `bsc-dataseed.binance.org`, `bsc-rpc.publicnode.com`.

### Likely origin

`A:\Projects\AICryptoTracker`, cloned 2026-01-20 from
`github.com/0xpcomp/AICryptoTracker`, ships the same loader in its
`postcss.config.js`. It was committed upstream as "Refactoring codebse for
speed" (2025-12-05), under another developer's name with copied history.
That is the profile of the fake-recruiter "take-home coding test" campaigns.
A scan of every project under `A:\Projects` found no other infected files.

## Guard added

`scripts/check-code-integrity.mjs` is a zero-dependency, text-only scanner
(it never imports what it scans). It fails on whitespace-hidden code, overlong
config lines, the IOC strings above, and config files that `eval` or expose
`require` globally. It runs:

- before `dev`, `build`, `lint`, `test*`, and e2e (`apps/binx-web/package.json`)
- inside the web Docker build, before `next build`
- as the first job of web CI (all other jobs `needs:` it), and before
  install in deploy and infra CI

Unit tests: `apps/binx-web/src/lib/check-code-integrity.test.ts`.

## Remediation checklist

Do these from a **different, clean device**. The infected machine may still
be compromised.

- [ ] Treat the dev machine as compromised: delete `A:\Projects\AICryptoTracker`,
      run a full AV/EDR scan, and preferably reinstall the OS. Re-infection
      after the first fix shows something persistent is running.
- [ ] Revoke GitHub sessions, PATs, SSH keys (`~/.ssh/*`), and the Git
      Credential Manager token. Review the repo's deploy keys, Actions, and
      webhooks for anything unfamiliar.
- [ ] Rotate AWS: `~/.aws/credentials` keys and SSO sessions. Review
      CloudTrail since 2026-01-20 for unknown principals or regions.
- [ ] Rotate everything in `apps/binx-api/.env`: DB password, `JWT_SECRET`
      (this logs every user out), Anthropic, Stripe secret and all webhook
      secrets, Google Places key.
- [ ] Rotate `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` in `binxportal/app` and
      `binxportal/staging` (exposed to the Oct 29–30 deploy build).
- [ ] Rotate production/staging secrets in Secrets Manager if they were ever
      fetched or viewed on this machine.
- [ ] Log out of all browser sessions and change passwords saved in the
      browser. Move any crypto wallets on this machine to new seeds.
- [ ] Delete or clean the ~40 infected remote branches
      (`git grep -l 'global.o=' origin/<branch>`). Never merge them as-is.
- [ ] Block the RPC hostnames above for Node/dev processes if your network
      allows. Legitimate binxportal code never contacts them.
