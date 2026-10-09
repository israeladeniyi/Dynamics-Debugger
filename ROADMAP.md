# Roadmap

The v0.1 milestones follow the D365 Trace Viewer Edge development plan:

1. Edge extension shell (done)
2. Dynamics detection (done, PR #2)
3. Capture proof of concept
4. Dataverse recognition
5. Clean timeline
6. Failure-first debugging
7. Friendly Dynamics translation
8. Export and privacy hardening
9. Action Stories prototype
10. Server telemetry research

## Planned features (after v0.1)

### Bring your own Copilot agent

Let a user connect a Microsoft Copilot Studio agent of their choice to the Trace Viewer. The agent can then help explain a recorded session, for example "Why did this save fail?" or "What should I check next?".

- **Optional and off by default.** The timeline and its plain-language sentences stay rule-based and work without any agent.
- **User configured.** The user adds their own agent's connection details in the extension settings. No agent is built in.
- **Sanitized input only.** The agent receives the normalized, redacted events (operation, table, status, duration, error code and message, request ID), never tokens, cookies or masked field values. The user sees what will be sent before it is sent.
- **Triggered explicitly.** An "Ask Copilot" action on an event or action story, not automatic.
- **To confirm before building:** how an extension can talk to a Copilot Studio agent (for example its Direct Line channel), and how sign-in and tenant policy affect that.

### After-save routing check

After a record is saved, query Dataverse for what should have followed (for example a queue item for a Case) and report "Saved, but no queue item was created within N seconds" when nothing appears. Routing runs on the server after the save, so the browser trace alone cannot show this. Belongs with the server telemetry work.
