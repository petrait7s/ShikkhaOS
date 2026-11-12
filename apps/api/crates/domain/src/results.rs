//! Official result lifecycle (contract C7). Pure state machine.
use crate::permissions::Role;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubmissionStatus {
    Draft,
    Submitted,
    UnderReview,
    CorrectionRequested,
    Verified,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubmissionAction {
    Submit,
    StartReview,
    RequestCorrection,
    Verify,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResultStatus {
    Verified,
    Approved,
    Published,
    /// Sent back by the Headmaster; terminal for this revision (the Register recompiles a new one).
    Rejected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResultAction {
    Approve,
    Publish,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum TransitionError {
    #[error("invalid state transition")]
    Invalid,
    #[error("separation of duties violation")]
    SeparationOfDuties,
    #[error("reason required")]
    ReasonRequired,
    #[error("publishing not permitted for this actor")]
    PublishNotPermitted,
}

impl SubmissionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Draft => "DRAFT",
            Self::Submitted => "SUBMITTED",
            Self::UnderReview => "UNDER_REVIEW",
            Self::CorrectionRequested => "CORRECTION_REQUESTED",
            Self::Verified => "VERIFIED",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "DRAFT" => Self::Draft,
            "SUBMITTED" => Self::Submitted,
            "UNDER_REVIEW" => Self::UnderReview,
            "CORRECTION_REQUESTED" => Self::CorrectionRequested,
            "VERIFIED" => Self::Verified,
            _ => return None,
        })
    }
    /// Teacher may edit entries only in these states.
    pub fn teacher_editable(&self) -> bool {
        matches!(self, Self::Draft | Self::CorrectionRequested)
    }
    pub fn next(self, action: SubmissionAction) -> Result<Self, TransitionError> {
        use SubmissionAction::*;
        use SubmissionStatus::*;
        Ok(match (self, action) {
            (Draft, Submit) | (CorrectionRequested, Submit) => Submitted,
            (Submitted, StartReview) => UnderReview,
            (UnderReview, RequestCorrection) => CorrectionRequested,
            (UnderReview, Verify) => Verified,
            _ => return Err(TransitionError::Invalid),
        })
    }
}

impl ResultStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Verified => "VERIFIED",
            Self::Approved => "APPROVED",
            Self::Published => "PUBLISHED",
            Self::Rejected => "REJECTED",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "REJECTED" => Self::Rejected,
            "VERIFIED" => Self::Verified,
            "APPROVED" => Self::Approved,
            "PUBLISHED" => Self::Published,
            _ => return None,
        })
    }
    pub fn next(self, action: ResultAction) -> Result<Self, TransitionError> {
        Ok(match (self, action) {
            (Self::Verified, ResultAction::Approve) => Self::Approved,
            (Self::Approved, ResultAction::Publish) => Self::Published,
            _ => return Err(TransitionError::Invalid),
        })
    }
}

/// The person who entered/submitted marks must not verify them.
pub fn check_verifier(
    submitted_by: Option<uuid_like::Id>,
    verifier: uuid_like::Id,
) -> Result<(), TransitionError> {
    match submitted_by {
        Some(s) if s == verifier => Err(TransitionError::SeparationOfDuties),
        _ => Ok(()),
    }
}

/// A Headmaster/approver cannot approve a set whose submissions they verified themselves.
pub fn check_approver(
    verifiers: &[uuid_like::Id],
    approver: uuid_like::Id,
) -> Result<(), TransitionError> {
    if verifiers.contains(&approver) {
        Err(TransitionError::SeparationOfDuties)
    } else {
        Ok(())
    }
}

pub fn require_reason(reason: &str) -> Result<(), TransitionError> {
    if reason.trim().is_empty() {
        Err(TransitionError::ReasonRequired)
    } else {
        Ok(())
    }
}

/// Publishing rule: needs `results.publish`; a Registrar additionally needs the school switch AND the per-exam flag.
pub fn can_publish(
    role: Role,
    has_publish_permission: bool,
    school_delegation: bool,
    exam_allows_registrar: bool,
) -> Result<(), TransitionError> {
    if !has_publish_permission {
        return Err(TransitionError::PublishNotPermitted);
    }
    match role {
        Role::Headmaster => Ok(()),
        Role::Registrar if school_delegation && exam_allows_registrar => Ok(()),
        _ => Err(TransitionError::PublishNotPermitted),
    }
}

pub mod uuid_like {
    /// Opaque actor id (UUID bytes) so the domain crate has no uuid dependency.
    pub type Id = u128;
}

#[cfg(test)]
mod tests {
    use super::*;
    use SubmissionAction::*;
    use SubmissionStatus::*;

    const ALL: [SubmissionStatus; 5] =
        [Draft, Submitted, UnderReview, CorrectionRequested, Verified];
    const ACTS: [SubmissionAction; 4] = [Submit, StartReview, RequestCorrection, Verify];

    #[test]
    fn happy_path_and_correction_loop() {
        let s = Draft.next(Submit).unwrap();
        let s = s.next(StartReview).unwrap();
        let s = s.next(RequestCorrection).unwrap();
        assert_eq!(s, CorrectionRequested);
        let s = s
            .next(Submit)
            .unwrap()
            .next(StartReview)
            .unwrap()
            .next(Verify)
            .unwrap();
        assert_eq!(s, Verified);
    }

    #[test]
    fn exactly_five_legal_submission_transitions() {
        let mut legal = 0;
        for s in ALL {
            for a in ACTS {
                if s.next(a).is_ok() {
                    legal += 1;
                }
            }
        }
        assert_eq!(legal, 5);
    }

    #[test]
    fn verified_is_terminal_for_submissions() {
        for a in ACTS {
            assert_eq!(Verified.next(a), Err(TransitionError::Invalid));
        }
    }

    #[test]
    fn teacher_cannot_edit_after_submit() {
        assert!(Draft.teacher_editable() && CorrectionRequested.teacher_editable());
        for s in [Submitted, UnderReview, Verified] {
            assert!(!s.teacher_editable());
        }
    }

    #[test]
    fn result_set_lifecycle_is_linear() {
        assert_eq!(
            ResultStatus::Verified.next(ResultAction::Approve),
            Ok(ResultStatus::Approved)
        );
        assert_eq!(
            ResultStatus::Approved.next(ResultAction::Publish),
            Ok(ResultStatus::Published)
        );
        assert!(ResultStatus::Verified.next(ResultAction::Publish).is_err());
        assert!(ResultStatus::Approved.next(ResultAction::Approve).is_err());
        assert!(ResultStatus::Published.next(ResultAction::Approve).is_err());
        assert!(ResultStatus::Published.next(ResultAction::Publish).is_err());
    }

    #[test]
    fn rejected_result_sets_cannot_advance() {
        assert!(ResultStatus::Rejected.next(ResultAction::Approve).is_err());
        assert!(ResultStatus::Rejected.next(ResultAction::Publish).is_err());
        assert_eq!(ResultStatus::parse("REJECTED"), Some(ResultStatus::Rejected));
    }

    #[test]
    fn separation_of_duties() {
        assert!(check_verifier(Some(1), 1).is_err());
        assert!(check_verifier(Some(1), 2).is_ok());
        assert!(check_approver(&[5, 6], 6).is_err());
        assert!(check_approver(&[5, 6], 7).is_ok());
    }

    #[test]
    fn publish_rules() {
        assert!(can_publish(Role::Headmaster, true, false, false).is_ok());
        assert!(can_publish(Role::Registrar, true, false, true).is_err());
        assert!(can_publish(Role::Registrar, true, true, false).is_err());
        assert!(can_publish(Role::Registrar, true, true, true).is_ok());
        assert!(can_publish(Role::Registrar, false, true, true).is_err());
        assert!(can_publish(Role::Teacher, true, true, true).is_err());
    }

    #[test]
    fn correction_needs_reason() {
        assert!(require_reason("  ").is_err());
        assert!(require_reason("wrong total").is_ok());
    }
}
