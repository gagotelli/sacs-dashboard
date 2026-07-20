// ManageEngine ServiceDesk Plus ticket summary — intentionally empty until a
// scheduled GitHub Actions workflow populates it (needs ZOHO_CLIENT_ID,
// ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN secrets; see README.md).
//
// Deliberately aggregate counts only — no individual ticket subjects,
// requester names, or descriptions. This dashboard is a public repo, and
// helpdesk tickets can contain student/staff names or sensitive details
// that have no business being world-readable.
const TICKET_SUMMARY = {
  updatedAt: null,
  source: null,
  total: null,
  open: null,
  urgent: null,
  byStatus: [],
  byPriority: [],
};
