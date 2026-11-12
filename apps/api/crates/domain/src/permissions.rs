//! Permission codes (contract C4) and role defaults.
use std::collections::BTreeSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Role {
    Headmaster,
    Registrar,
    Teacher,
    Student,
}

impl Role {
    pub fn as_str(&self) -> &'static str {
        match self {
            Role::Headmaster => "HEADMASTER",
            Role::Registrar => "REGISTRAR",
            Role::Teacher => "TEACHER",
            Role::Student => "STUDENT",
        }
    }
    pub fn parse(s: &str) -> Option<Role> {
        Some(match s {
            "HEADMASTER" => Role::Headmaster,
            "REGISTRAR" => Role::Registrar,
            "TEACHER" => Role::Teacher,
            "STUDENT" => Role::Student,
            _ => return None,
        })
    }
    pub fn is_staff(&self) -> bool {
        !matches!(self, Role::Student)
    }
}

pub const ALL_PERMISSIONS: &[&str] = &[
    "school.settings.read", "school.settings.update",
    "users.read", "users.create", "users.update", "users.deactivate", "users.reset_password",
    "roles.read", "roles.manage",
    "students.read", "students.create", "students.update", "students.archive", "students.read_own",
    "teachers.read", "teachers.create", "teachers.update", "teachers.deactivate",
    "academic.sessions.manage", "academic.classes.manage", "academic.sections.manage",
    "academic.subjects.manage", "academic.assignments.manage", "academic.enrollments.manage",
    "exams.read", "exams.create", "exams.update", "exams.authorize",
    "marks.enter", "marks.submit", "marks.review", "marks.request_correction", "marks.verify",
    "results.approve", "results.publish", "results.revise_published", "results.read_published", "results.read_own",
    "reportcards.generate", "reportcards.read_own",
    "attendance.mark", "attendance.read", "attendance.read_own", "attendance.correct",
    "classtests.manage", "classtests.share",
    "messages.send_direct", "messages.send_group", "messages.read",
    "channels.post_official", "channels.manage",
    "notices.read", "notices.create", "notices.publish",
    "homework.manage", "homework.read", "homework.submit",
    "documents.read", "documents.manage", "certificates.issue",
    "reports.read", "audit.read", "audit.export",
    "moderation.review", "moderation.report",
    "settings.system.manage",
];

/// Permissions a Headmaster may delegate to non-headmasters via per-user GRANT.
pub const DELEGABLE: &[&str] = &[
    "results.approve", "results.publish", "exams.authorize", "audit.read", "moderation.review", "notices.publish",
];

pub fn is_known(p: &str) -> bool {
    ALL_PERMISSIONS.contains(&p)
}

pub fn role_defaults(role: Role) -> BTreeSet<&'static str> {
    let list: Vec<&'static str> = match role {
        Role::Headmaster => ALL_PERMISSIONS
            .iter()
            .copied()
            .filter(|p| !p.ends_with("read_own") && !matches!(*p, "marks.enter" | "marks.submit" | "homework.submit"))
            .collect(),
        Role::Registrar => vec![
            "school.settings.read", "users.read", "users.create", "users.update", "users.reset_password",
            "students.read", "students.create", "students.update", "students.archive",
            "teachers.read", "teachers.create", "teachers.update",
            "academic.sessions.manage", "academic.classes.manage", "academic.sections.manage",
            "academic.subjects.manage", "academic.assignments.manage", "academic.enrollments.manage",
            "exams.read", "exams.create", "exams.update",
            "marks.review", "marks.request_correction", "marks.verify",
            "results.read_published", "reportcards.generate",
            "attendance.read", "attendance.correct",
            "messages.send_direct", "messages.send_group", "messages.read",
            "notices.read", "notices.create", "homework.read",
            "documents.read", "documents.manage", "certificates.issue", "reports.read",
            "moderation.report",
        ],
        Role::Teacher => vec![
            "students.read", "teachers.read", "exams.read",
            "marks.enter", "marks.submit",
            "attendance.mark", "attendance.read",
            "classtests.manage", "classtests.share",
            "messages.send_direct", "messages.send_group", "messages.read",
            "notices.read", "notices.create",
            "homework.manage", "homework.read",
            "results.read_published", "moderation.report", "documents.read",
        ],
        Role::Student => vec![
            "students.read_own", "results.read_own", "reportcards.read_own", "attendance.read_own",
            "homework.read", "homework.submit", "notices.read",
            "messages.send_direct", "messages.read", "moderation.report",
        ],
    };
    list.into_iter().collect()
}

/// Effective permissions: role defaults + GRANT overrides (only delegable ones for non-headmasters) − REVOKE (revoke wins).
pub fn effective(role: Role, grants: &[(String, bool)]) -> BTreeSet<String> {
    let mut set: BTreeSet<String> = role_defaults(role).into_iter().map(String::from).collect();
    for (p, is_grant) in grants {
        if *is_grant && is_known(p) && (role == Role::Headmaster || DELEGABLE.contains(&p.as_str())) {
            set.insert(p.clone());
        }
    }
    for (p, is_grant) in grants {
        if !*is_grant {
            set.remove(p);
        }
    }
    set
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registrar_cannot_approve_or_manage_roles_by_default() {
        let d = role_defaults(Role::Registrar);
        assert!(!d.contains("results.approve"));
        assert!(!d.contains("roles.manage"));
        assert!(!d.contains("exams.authorize"));
        assert!(!d.contains("results.publish"));
        assert!(!d.contains("audit.export"));
    }
    #[test]
    fn headmaster_has_authority() {
        let d = role_defaults(Role::Headmaster);
        for p in ["results.approve", "results.publish", "exams.authorize", "roles.manage", "audit.read"] {
            assert!(d.contains(p), "{p}");
        }
        assert!(!d.contains("marks.enter"));
    }
    #[test]
    fn student_sees_only_own() {
        let d = role_defaults(Role::Student);
        assert!(d.contains("results.read_own") && !d.contains("students.read") && !d.contains("results.read_published"));
    }
    #[test]
    fn revoke_wins_and_grants_limited_to_delegable() {
        let g = vec![
            ("results.approve".to_string(), true),
            ("roles.manage".to_string(), true), // not delegable => ignored
            ("students.create".to_string(), false),
        ];
        let e = effective(Role::Registrar, &g);
        assert!(e.contains("results.approve"));
        assert!(!e.contains("roles.manage"));
        assert!(!e.contains("students.create"));
        let both = vec![("results.approve".to_string(), true), ("results.approve".to_string(), false)];
        assert!(!effective(Role::Registrar, &both).contains("results.approve"));
    }
    #[test]
    fn all_defaults_are_known_codes() {
        for r in [Role::Headmaster, Role::Registrar, Role::Teacher, Role::Student] {
            for p in role_defaults(r) {
                assert!(is_known(p), "{p}");
            }
        }
    }
}
