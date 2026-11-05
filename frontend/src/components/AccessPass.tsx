import type { User } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

const ROLE_LABEL: Record<User["role"], string> = {
  admin: "Administrator",
  user: "Member",
};

export function AccessPass({ user }: { user: User }) {
  return (
    <section className="pass" aria-label="Your account">
      <div className="pass-slot" aria-hidden="true" />
      <p className="pass-role" data-role={user.role}>
        {ROLE_LABEL[user.role]}
      </p>
      <div className="pass-body">
        <h1 className="pass-name">{user.name}</h1>
        <dl className="pass-facts">
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Joined</dt>
            <dd>{formatDate(user.createdAt)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
