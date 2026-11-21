---
name: reviewtrail
description: Open ReviewTrail to read a local diff or PR and return the reviewer's feedback to this conversation.
disable-model-invocation: true
---

Open the review from the current repository. Pass the user's review target and flags to the `reviewtrail` executable as arguments. Quote paths containing spaces. With no arguments run `reviewtrail`. Wait for the reviewer to finish, then address their feedback. A dismissed review ends without approval.

Requested arguments: $ARGUMENTS
