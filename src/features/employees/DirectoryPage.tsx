import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Search, ShieldCheck, Users } from "lucide-react";
import type { NotifyFn, User } from "../../types";
import { api } from "../../services/api";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/ui/LoadingState";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { UserAvatar } from "../../components/ui/UserAvatar";

export interface DirectoryPageProps {
  user: User;
  notify: NotifyFn;
}

export function DirectoryPage({ user, notify }: DirectoryPageProps) {
  const [rows, setRows] = useState<
    Array<{
      id: number;
      name: string;
      employeeId: string;
      employmentType: string;
      position: string;
      department: string | null;
      team: string | null;
      active: number;
      photoUrl?: string | null;
    }>
  >([]);
  const [teams, setTeams] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [teamName, setTeamName] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [role, setRole] = useState("employee");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [people, teamData] = await Promise.all([
        api<typeof rows>("/api/employees"),
        api<typeof teams>("/api/teams"),
      ]);
      setRows(people);
      setTeams(teamData);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load people.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = rows.filter((row) =>
    `${row.name} ${row.employeeId} ${row.position} ${row.department ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  async function createTeam(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/teams", { method: "POST", body: JSON.stringify({ name: teamName }) });
      setTeamName("");
      notify("Team created.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to create team.", "error");
    }
  }

  async function assign(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/teams/assign", {
        method: "POST",
        body: JSON.stringify({
          teamId: Number(selectedTeam),
          employeeId: Number(selectedEmployee),
          role,
        }),
      });
      notify("Team membership and access role updated.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to assign team member.", "error");
    }
  }

  return (
    <div className="page-content">
      <PageHeader
        title={user.role === "ceo" ? "People directory" : "My team"}
        subtitle="Approved employee records only. Employment category and access role are managed separately."
        action={
          <span className="count-chip">
            {rows.length} {rows.length === 1 ? "person" : "people"}
          </span>
        }
      />
      <div className="directory-toolbar">
        <label className="search-box directory-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, ID, or department"
          />
        </label>
      </div>
      {user.role === "ceo" && (
        <div className="team-admin-grid">
          <form className="panel compact-form" onSubmit={createTeam}>
            <div className="panel-heading">
              <div>
                <h2>Create a team</h2>
                <p>Optional workspace grouping</p>
              </div>
              <Users size={18} />
            </div>
            <div className="inline-form">
              <input
                required
                minLength={2}
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                placeholder="Team name"
              />
              <Button type="submit">Create team</Button>
            </div>
          </form>
          <form className="panel compact-form" onSubmit={assign}>
            <div className="panel-heading">
              <div>
                <h2>Assign access</h2>
                <p>CEO-controlled team and role assignment</p>
              </div>
              <ShieldCheck size={18} />
            </div>
            <div className="assign-grid">
              <select required value={selectedTeam} onChange={(event) => setSelectedTeam(event.target.value)}>
                <option value="">Choose team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <select
                required
                value={selectedEmployee}
                onChange={(event) => setSelectedEmployee(event.target.value)}
              >
                <option value="">Choose person</option>
                {rows.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
              <select value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="employee">Employee access</option>
                <option value="team_lead">Team Lead access</option>
              </select>
              <Button type="submit" disabled={!teams.length || !rows.length}>
                Assign
              </Button>
            </div>
          </form>
        </div>
      )}
      <section className="panel table-panel">
        {loading ? (
          <LoadingState />
        ) : filtered.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Employee ID</th>
                  <th>Employment type</th>
                  <th>Position</th>
                  <th>Department</th>
                  <th>Team</th>
                  <th>Account</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <span className="table-person">
                        <UserAvatar
                          user={{ name: person.name, photoUrl: person.photoUrl }}
                          className="tiny-avatar"
                        />
                        <span>
                          <strong>{person.name}</strong>
                        </span>
                      </span>
                    </td>
                    <td className="muted-cell">{person.employeeId}</td>
                    <td className="capitalize">{person.employmentType}</td>
                    <td>{person.position}</td>
                    <td>{person.department || "—"}</td>
                    <td>{person.team || "—"}</td>
                    <td>
                      <StatusPill status={person.active ? "active" : "activation pending"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No matching employee records"
            detail="Applications create employee records only after authorized approval."
            icon={<Users size={22} />}
          />
        )}
      </section>
    </div>
  );
}
