//! Grading, GPA and ranking (contract C15 default scheme).
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Band {
    pub min: Decimal,
    pub grade: String,
    pub point: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GradingScheme {
    pub bands: Vec<Band>, // sorted by min descending
    #[serde(default = "yes")]
    pub fail_if_any_subject_fails: bool,
}
fn yes() -> bool {
    true
}

impl GradingScheme {
    pub fn default_scheme() -> Self {
        let b = |m: Decimal, g: &str, p: Decimal| Band {
            min: m,
            grade: g.into(),
            point: p,
        };
        GradingScheme {
            bands: vec![
                b(dec!(80), "A+", dec!(5.00)),
                b(dec!(70), "A", dec!(4.00)),
                b(dec!(60), "A-", dec!(3.50)),
                b(dec!(50), "B", dec!(3.00)),
                b(dec!(40), "C", dec!(2.00)),
                b(dec!(33), "D", dec!(1.00)),
                b(dec!(0), "F", dec!(0.00)),
            ],
            fail_if_any_subject_fails: true,
        }
    }
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.bands.is_empty() {
            return Err("no bands");
        }
        if !self.bands.windows(2).all(|w| w[0].min > w[1].min) {
            return Err("bands must be strictly descending");
        }
        if self.bands.last().unwrap().min != dec!(0) {
            return Err("lowest band must start at 0");
        }
        Ok(())
    }
    pub fn band_for_pct(&self, pct: Decimal) -> &Band {
        self.bands
            .iter()
            .find(|b| pct >= b.min)
            .unwrap_or_else(|| self.bands.last().unwrap())
    }
}

#[derive(Debug, Clone)]
pub struct SubjectInput {
    pub subject_id: String,
    pub marks: Option<Decimal>,
    pub absent: bool,
    pub full_marks: Decimal,
    pub pass_marks: Decimal,
    pub optional: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SubjectResult {
    pub subject_id: String,
    pub marks: Decimal,
    pub full_marks: Decimal,
    pub grade: String,
    pub grade_point: Decimal,
    pub absent: bool,
    pub passed: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StudentComputed {
    pub subjects: Vec<SubjectResult>,
    pub total_marks: Decimal,
    pub gpa: Decimal,
    pub grade: String,
    pub passed: bool,
}

/// Absent counts as 0 and fails the subject. Optional subjects never fail the student and only add
/// (point - 2) above 2.0 as a bonus to the GPA numerator (Bangladesh convention); GPA is capped at 5.00.
pub fn compute_student(scheme: &GradingScheme, inputs: &[SubjectInput]) -> StudentComputed {
    let mut subjects = Vec::new();
    let mut total = dec!(0);
    let mut compulsory_points = dec!(0);
    let mut compulsory_count = 0u32;
    let mut bonus = dec!(0);
    let mut any_fail = false;
    for i in inputs {
        let marks = if i.absent {
            dec!(0)
        } else {
            i.marks.unwrap_or(dec!(0))
        };
        let pct = if i.full_marks.is_zero() {
            dec!(0)
        } else {
            marks * dec!(100) / i.full_marks
        };
        let failed = i.absent || marks < i.pass_marks;
        let band = scheme.band_for_pct(pct);
        let (grade, point) = if failed {
            ("F".to_string(), dec!(0))
        } else {
            (band.grade.clone(), band.point)
        };
        total += marks;
        if i.optional {
            if point > dec!(2) {
                bonus += point - dec!(2);
            }
        } else {
            compulsory_points += point;
            compulsory_count += 1;
            if failed {
                any_fail = true;
            }
        }
        subjects.push(SubjectResult {
            subject_id: i.subject_id.clone(),
            marks,
            full_marks: i.full_marks,
            grade,
            grade_point: point,
            absent: i.absent,
            passed: !failed,
        });
    }
    let passed = !(scheme.fail_if_any_subject_fails && any_fail) && compulsory_count > 0;
    let gpa = if !passed || compulsory_count == 0 {
        dec!(0)
    } else {
        ((compulsory_points + bonus) / Decimal::from(compulsory_count))
            .min(dec!(5))
            .round_dp(2)
    };
    let grade = if !passed {
        "F".to_string()
    } else {
        scheme
            .bands
            .iter()
            .find(|b| gpa >= b.point)
            .map(|b| b.grade.clone())
            .unwrap_or_else(|| "F".into())
    };
    StudentComputed {
        subjects,
        total_marks: total,
        gpa,
        grade,
        passed,
    }
}

/// Competition ranking (1,1,3): passed first, then GPA desc, then total desc. Failed students get no position.
pub fn assign_positions(rows: &[(bool, Decimal, Decimal)]) -> Vec<Option<u32>> {
    let mut idx: Vec<usize> = (0..rows.len()).collect();
    idx.sort_by(|&a, &b| {
        rows[b]
            .0
            .cmp(&rows[a].0)
            .then(rows[b].1.cmp(&rows[a].1))
            .then(rows[b].2.cmp(&rows[a].2))
    });
    let mut out = vec![None; rows.len()];
    let mut rank = 0u32;
    let mut prev: Option<(Decimal, Decimal)> = None;
    for (n, &i) in idx.iter().enumerate() {
        if !rows[i].0 {
            continue;
        }
        let key = (rows[i].1, rows[i].2);
        if prev != Some(key) {
            rank = n as u32 + 1;
            prev = Some(key);
        }
        out[i] = Some(rank);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn inp(id: &str, m: Option<Decimal>, absent: bool, optional: bool) -> SubjectInput {
        SubjectInput {
            subject_id: id.into(),
            marks: m,
            absent,
            full_marks: dec!(100),
            pass_marks: dec!(33),
            optional,
        }
    }

    #[test]
    fn default_scheme_is_valid_and_bands_match_contract() {
        let s = GradingScheme::default_scheme();
        s.validate().unwrap();
        for (pct, g) in [
            (dec!(100), "A+"),
            (dec!(80), "A+"),
            (dec!(79), "A"),
            (dec!(70), "A"),
            (dec!(60), "A-"),
            (dec!(50), "B"),
            (dec!(40), "C"),
            (dec!(33), "D"),
            (dec!(32), "F"),
            (dec!(0), "F"),
        ] {
            assert_eq!(s.band_for_pct(pct).grade, g, "{pct}");
        }
    }

    #[test]
    fn gpa_average_of_compulsory() {
        let s = GradingScheme::default_scheme();
        let r = compute_student(
            &s,
            &[
                inp("a", Some(dec!(90)), false, false),
                inp("b", Some(dec!(75)), false, false),
            ],
        );
        assert_eq!(r.gpa, dec!(4.50));
        assert_eq!(r.total_marks, dec!(165));
        assert!(r.passed);
    }

    #[test]
    fn one_failed_subject_fails_student() {
        let s = GradingScheme::default_scheme();
        let r = compute_student(
            &s,
            &[
                inp("a", Some(dec!(90)), false, false),
                inp("b", Some(dec!(20)), false, false),
            ],
        );
        assert!(!r.passed);
        assert_eq!(r.gpa, dec!(0));
        assert_eq!(r.grade, "F");
    }

    #[test]
    fn absent_counts_zero_and_fails() {
        let s = GradingScheme::default_scheme();
        let r = compute_student(
            &s,
            &[
                inp("a", None, true, false),
                inp("b", Some(dec!(90)), false, false),
            ],
        );
        assert!(!r.passed);
        assert!(r.subjects[0].absent && r.subjects[0].marks == dec!(0));
    }

    #[test]
    fn optional_subject_bonus_and_no_fail() {
        let s = GradingScheme::default_scheme();
        let r = compute_student(
            &s,
            &[
                inp("a", Some(dec!(80)), false, false),
                inp("b", Some(dec!(80)), false, false),
                inp("o", Some(dec!(80)), false, true),
            ],
        );
        assert_eq!(r.gpa, dec!(5.00)); // (10+3)/2 capped at 5
        let r2 = compute_student(
            &s,
            &[
                inp("a", Some(dec!(80)), false, false),
                inp("o", Some(dec!(10)), false, true),
            ],
        );
        assert!(r2.passed);
    }

    #[test]
    fn positions_with_ties_and_failures() {
        let rows = vec![
            (true, dec!(5), dec!(450)),
            (true, dec!(5), dec!(450)),
            (false, dec!(0), dec!(300)),
            (true, dec!(4), dec!(400)),
        ];
        assert_eq!(
            assign_positions(&rows),
            vec![Some(1), Some(1), None, Some(3)]
        );
    }

    proptest! {
        #[test]
        fn gpa_always_between_0_and_5(a in 0u32..=100, b in 0u32..=100, c in 0u32..=100) {
            let s = GradingScheme::default_scheme();
            let r = compute_student(&s, &[inp("a", Some(Decimal::from(a)), false, false), inp("b", Some(Decimal::from(b)), false, false), inp("c", Some(Decimal::from(c)), false, true)]);
            prop_assert!(r.gpa >= dec!(0) && r.gpa <= dec!(5));
            if !r.passed { prop_assert_eq!(r.gpa, dec!(0)); }
        }
        #[test]
        fn more_marks_never_lowers_gpa(a in 0u32..=99) {
            let s = GradingScheme::default_scheme();
            let lo = compute_student(&s, &[inp("a", Some(Decimal::from(a)), false, false)]);
            let hi = compute_student(&s, &[inp("a", Some(Decimal::from(a + 1)), false, false)]);
            prop_assert!(hi.gpa >= lo.gpa);
        }
    }
}
