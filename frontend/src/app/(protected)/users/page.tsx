import type { Metadata } from "next";
import Link from "next/link";
import { listUsers, requireUser } from "@/lib/api/server";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "People" };

const PATH = "/users";

export default async function UsersPage() {
  await requireUser(PATH);
  const result = await listUsers(PATH);

  if (result.status === "forbidden") {
    return (
      <div className="panel">
        <h1>You don&apos;t have access to this page</h1>
        <p>Only administrators can see the list of people.</p>
        <Link href="/dashboard">Go to your dashboard</Link>
      </div>
    );
  }

  return (
    <>
      <h1>People</h1>
      <p className="lede">
        {result.total === 1 ? "1 account" : `${result.total} accounts`}, oldest
        first.
      </p>
      <table className="people">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Joined</th>
          </tr>
        </thead>
        <tbody>
          {result.users.map((person) => (
            <tr key={person.id}>
              <th scope="row">{person.name}</th>
              <td data-label="Email">{person.email}</td>
              <td data-label="Role">
                {person.role === "admin" ? "Administrator" : "Member"}
              </td>
              <td data-label="Joined">{formatDate(person.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
