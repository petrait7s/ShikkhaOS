//! Messaging policy (contract C13). Table-driven; student<->student is ALWAYS denied in v1.
use crate::permissions::Role;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Denial {
    StudentDmDisabled,
    FeatureDisabled,
    NotAssigned,
    SelfMessage,
}

impl Denial {
    pub fn code(&self) -> &'static str {
        match self {
            Denial::StudentDmDisabled => "STUDENT_DM_DISABLED",
            Denial::FeatureDisabled => "MESSAGING_FEATURE_DISABLED",
            Denial::NotAssigned => "RECIPIENT_NOT_PERMITTED",
            Denial::SelfMessage => "CANNOT_MESSAGE_SELF",
        }
    }
}

pub struct DmContext {
    pub sender: Role,
    pub recipient: Role,
    pub same_user: bool,
    /// sender or recipient teacher teaches the student's section (TeacherAssignment match)
    pub teacher_teaches_student: bool,
    pub student_to_teacher_enabled: bool,
    pub student_to_admin_enabled: bool,
}

pub fn can_start_direct(c: &DmContext) -> Result<(), Denial> {
    use Role::*;
    if c.same_user {
        return Err(Denial::SelfMessage);
    }
    match (c.sender, c.recipient) {
        (Student, Student) => Err(Denial::StudentDmDisabled),
        (Student, Teacher) => {
            if !c.student_to_teacher_enabled {
                Err(Denial::FeatureDisabled)
            } else if !c.teacher_teaches_student {
                Err(Denial::NotAssigned)
            } else {
                Ok(())
            }
        }
        (Student, Headmaster) | (Student, Registrar) => {
            if c.student_to_admin_enabled {
                Ok(())
            } else {
                Err(Denial::FeatureDisabled)
            }
        }
        (Teacher, Student) => {
            if c.teacher_teaches_student {
                Ok(())
            } else {
                Err(Denial::NotAssigned)
            }
        }
        (Headmaster, _) | (Registrar, _) => Ok(()),
        (Teacher, _) => Ok(()),
    }
}

/// May this role post in a conversation type?
pub fn can_post(role: Role, kind: &str, students_can_post: bool, is_official_poster: bool) -> bool {
    match (kind, role) {
        ("CHANNEL", Role::Student) => false,
        ("CHANNEL", _) => is_official_poster,
        ("CLASS_GROUP", Role::Student) => students_can_post,
        ("CLASS_GROUP", _) => true,
        ("DIRECT", _) => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ctx(s: Role, r: Role) -> DmContext {
        DmContext {
            sender: s,
            recipient: r,
            same_user: false,
            teacher_teaches_student: true,
            student_to_teacher_enabled: true,
            student_to_admin_enabled: true,
        }
    }
    #[test]
    fn student_to_student_always_denied() {
        let mut c = ctx(Role::Student, Role::Student);
        assert_eq!(can_start_direct(&c), Err(Denial::StudentDmDisabled));
        c.student_to_teacher_enabled = true;
        c.student_to_admin_enabled = true;
        c.teacher_teaches_student = true;
        assert_eq!(can_start_direct(&c), Err(Denial::StudentDmDisabled));
    }
    #[test]
    fn student_to_teacher_requires_assignment_and_flag() {
        let mut c = ctx(Role::Student, Role::Teacher);
        assert!(can_start_direct(&c).is_ok());
        c.teacher_teaches_student = false;
        assert_eq!(can_start_direct(&c), Err(Denial::NotAssigned));
        c.teacher_teaches_student = true;
        c.student_to_teacher_enabled = false;
        assert_eq!(can_start_direct(&c), Err(Denial::FeatureDisabled));
    }
    #[test]
    fn student_to_admin_flag() {
        let mut c = ctx(Role::Student, Role::Registrar);
        assert!(can_start_direct(&c).is_ok());
        c.student_to_admin_enabled = false;
        assert_eq!(can_start_direct(&c), Err(Denial::FeatureDisabled));
    }
    #[test]
    fn staff_matrix() {
        assert!(can_start_direct(&ctx(Role::Teacher, Role::Teacher)).is_ok());
        assert!(can_start_direct(&ctx(Role::Teacher, Role::Headmaster)).is_ok());
        assert!(can_start_direct(&ctx(Role::Headmaster, Role::Student)).is_ok());
        let mut c = ctx(Role::Teacher, Role::Student);
        c.teacher_teaches_student = false;
        assert_eq!(can_start_direct(&c), Err(Denial::NotAssigned));
        let mut s = ctx(Role::Teacher, Role::Teacher);
        s.same_user = true;
        assert_eq!(can_start_direct(&s), Err(Denial::SelfMessage));
    }
    #[test]
    fn posting_rules() {
        assert!(!can_post(Role::Student, "CHANNEL", true, true));
        assert!(can_post(Role::Headmaster, "CHANNEL", false, true));
        assert!(!can_post(Role::Teacher, "CHANNEL", false, false));
        assert!(!can_post(Role::Student, "CLASS_GROUP", false, false));
        assert!(can_post(Role::Student, "CLASS_GROUP", true, false));
        assert!(can_post(Role::Teacher, "CLASS_GROUP", false, false));
    }
}
