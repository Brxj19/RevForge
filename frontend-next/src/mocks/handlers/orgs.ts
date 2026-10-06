import { http, HttpResponse } from "msw";
import type { OrganizationSummary } from "~/lib/api/types";
import { db, ORGS, REPOS } from "../db";
import { API, notFound, unauthorized } from "./util";

function summary(o: (typeof ORGS)[number]): OrganizationSummary {
  const role = db.session ? o.members[db.session] : undefined;
  const { members: _members, ...rest } = o;
  return {
    ...rest,
    viewer_role: role ?? "member",
    can_manage: role === "owner" || role === "admin",
  };
}

export const orgHandlers = [
  http.get(`${API}/organizations`, () => {
    if (!db.session) return unauthorized();
    const user = db.session;
    return HttpResponse.json(ORGS.filter((o) => o.members[user]).map(summary));
  }),
  http.get(`${API}/organizations/:org`, ({ params }) => {
    const o = ORGS.find((x) => x.slug === params.org);
    if (!o || !db.session || !o.members[db.session]) return notFound();
    return HttpResponse.json({
      ...summary(o),
      member_count: Object.keys(o.members).length,
      repository_count: REPOS.filter((r) => r.org === o.slug).length,
    });
  }),
];
