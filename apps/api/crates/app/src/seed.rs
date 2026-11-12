//! Bootstrap + deterministic demo seed. Demo data must never run in production (guarded by ALLOW_DEMO_SEED).
use sqlx::PgPool;
use uuid::Uuid;
use crate::{auth::{hash_password, temp_password}, error::ApiResult};

pub const DEMO_PASSWORD: &str = "Demo@Pass2026";

pub async fn bootstrap_admin(db: &PgPool, username: &str, name: &str) -> Result<String, String> {
    shikkhaos_domain::validation::username(username).map_err(|e| e.message)?;
    let pw = temp_password();
    let hash = hash_password(&pw).map_err(|_| "hash failed".to_string())?;
    sqlx::query("INSERT INTO users (role, username, display_name, password_hash, must_change_password) VALUES ('HEADMASTER',$1,$2,$3,true)").bind(username).bind(name).bind(hash).execute(db).await.map_err(|e| e.to_string())?;
    ensure_school(db).await.map_err(|_| "school profile failed".to_string())?;
    Ok(pw)
}

pub async fn ensure_school(db: &PgPool) -> ApiResult<()> {
    let scheme = serde_json::to_value(shikkhaos_domain::grading::GradingScheme::default_scheme()).unwrap();
    sqlx::query("INSERT INTO school_profile (id, name, name_bn, grading_scheme, address, phone, email, motto) VALUES (1, 'ShikkhaOS Model School', 'শিক্ষাওএস মডেল স্কুল', $1, 'Sylhet, Bangladesh', '01700000000', 'office@school.example', 'One School. One System. One Connected Community.') ON CONFLICT DO NOTHING").bind(scheme).execute(db).await?;
    ensure_channels(db).await?;
    Ok(())
}

pub async fn ensure_channels(db: &PgPool) -> ApiResult<()> {
    for (kind, title) in [("ANNOUNCEMENTS", "Announcements"), ("STAFF", "Staff Room")] {
        sqlx::query("INSERT INTO conversations (type, title, channel_kind, is_read_only_for_students) SELECT 'CHANNEL', $2, $1, true WHERE NOT EXISTS (SELECT 1 FROM conversations WHERE type='CHANNEL' AND channel_kind=$1)").bind(kind).bind(title).execute(db).await?;
    }
    Ok(())
}

pub struct Ids { pub session: Uuid, pub class6: Uuid, pub sec6a: Uuid, pub sec6b: Uuid, pub subj_math: Uuid, pub subj_eng: Uuid, pub teacher_rahim: Uuid, pub teacher_salma: Uuid }

async fn user(db: &PgPool, hash: &str, role: &str, username: &str, name: &str) -> ApiResult<Uuid> {
    Ok(sqlx::query_scalar("INSERT INTO users (role, username, display_name, password_hash) VALUES ($1,$2,$3,$4) RETURNING id").bind(role).bind(username).bind(name).bind(hash).fetch_one(db).await?)
}

const STUDENT_NAMES: &[(&str, &str, &str)] = &[
    ("ayesha", "Ayesha Siddiqua", "FEMALE"), ("farhan", "Farhan Ahmed", "MALE"), ("nusrat", "Nusrat Jahan", "FEMALE"), ("tahmid", "Tahmid Hasan", "MALE"),
    ("rafi", "Rafiul Islam", "MALE"), ("mitu", "Mitu Akter", "FEMALE"), ("sabbir", "Sabbir Hossain", "MALE"), ("tania", "Tania Rahman", "FEMALE"),
];

/// Small deterministic dataset: 1 session, Class 6 (A,B), 3 subjects, 2 teachers, 8 students.
pub async fn demo_small(db: &PgPool) -> ApiResult<Ids> {
    ensure_school(db).await?;
    let hash = hash_password(DEMO_PASSWORD)?;
    user(db, &hash, "HEADMASTER", "headmaster", "Md. Abdul Karim").await?;
    user(db, &hash, "REGISTRAR", "registrar", "Shirin Akter").await?;
    let t1u = user(db, &hash, "TEACHER", "teacher.rahim", "Rahim Uddin").await?;
    let t2u = user(db, &hash, "TEACHER", "teacher.salma", "Salma Khatun").await?;
    let teacher_rahim: Uuid = sqlx::query_scalar("INSERT INTO teachers (user_id, employee_code, full_name, designation) VALUES ($1,'T-001','Rahim Uddin','Senior Teacher') RETURNING id").bind(t1u).fetch_one(db).await?;
    let teacher_salma: Uuid = sqlx::query_scalar("INSERT INTO teachers (user_id, employee_code, full_name, designation) VALUES ($1,'T-002','Salma Khatun','Assistant Teacher') RETURNING id").bind(t2u).fetch_one(db).await?;
    let session: Uuid = sqlx::query_scalar("INSERT INTO academic_sessions (name, start_date, end_date, is_current) VALUES ('2026','2026-01-01','2026-12-31',true) RETURNING id").fetch_one(db).await?;
    let class6: Uuid = sqlx::query_scalar("INSERT INTO classes (name, level, \"order\") VALUES ('Class 6', 6, 6) RETURNING id").fetch_one(db).await?;
    let sec6a: Uuid = sqlx::query_scalar("INSERT INTO sections (class_id, name, capacity) VALUES ($1,'A',40) RETURNING id").bind(class6).fetch_one(db).await?;
    let sec6b: Uuid = sqlx::query_scalar("INSERT INTO sections (class_id, name, capacity) VALUES ($1,'B',40) RETURNING id").bind(class6).fetch_one(db).await?;
    let mut subj = vec![];
    for (code, name) in [("MATH", "Mathematics"), ("ENG", "English"), ("BAN", "Bangla")] {
        let id: Uuid = sqlx::query_scalar("INSERT INTO subjects (code, name) VALUES ($1,$2) RETURNING id").bind(code).bind(name).fetch_one(db).await?;
        sqlx::query("INSERT INTO class_subjects (class_id, subject_id, session_id, full_marks, pass_marks) VALUES ($1,$2,$3,100,33)").bind(class6).bind(id).bind(session).execute(db).await?;
        subj.push(id);
    }
    let (subj_math, subj_eng, subj_ban) = (subj[0], subj[1], subj[2]);
    for sec in [sec6a, sec6b] {
        for (t, s) in [(teacher_rahim, subj_math), (teacher_salma, subj_eng), (teacher_salma, subj_ban)] {
            sqlx::query("INSERT INTO teacher_assignments (teacher_id, session_id, class_id, section_id, subject_id) VALUES ($1,$2,$3,$4,$5)").bind(t).bind(session).bind(class6).bind(sec).bind(s).execute(db).await?;
        }
    }
    sqlx::query("UPDATE teacher_assignments SET is_class_teacher = true WHERE id = (SELECT id FROM teacher_assignments WHERE teacher_id=$1 AND section_id=$2 LIMIT 1)").bind(teacher_rahim).bind(sec6a).execute(db).await?;
    for (i, (u, name, gender)) in STUDENT_NAMES.iter().enumerate() {
        let uid = user(db, &hash, "STUDENT", &format!("student.{u}"), name).await?;
        let code = format!("S-2026-{:03}", i + 1);
        let sid: Uuid = sqlx::query_scalar("INSERT INTO students (user_id, student_code, full_name, dob, gender, guardian_name, guardian_phone) VALUES ($1,$2,$3,'2014-03-15',$4,'Guardian of '||$3,'01711111111') RETURNING id").bind(uid).bind(&code).bind(name).bind(gender).fetch_one(db).await?;
        let (sec, roll) = if i < 5 { (sec6a, i as i32 + 1) } else { (sec6b, i as i32 - 4) };
        sqlx::query("INSERT INTO enrollments (student_id, session_id, class_id, section_id, roll_no) VALUES ($1,$2,$3,$4,$5)").bind(sid).bind(session).bind(class6).bind(sec).bind(roll).execute(db).await?;
    }
    let mut conn = db.acquire().await?;
    crate::groups::sync_class_group(&mut conn, sec6a).await?;
    crate::groups::sync_class_group(&mut conn, sec6b).await?;
    Ok(Ids { session, class6, sec6a, sec6b, subj_math, subj_eng, teacher_rahim, teacher_salma })
}

pub async fn demo(db: &PgPool) -> Result<(), String> {
    demo_small(db).await.map(|_| ()).map_err(|e| format!("{}: {}", e.code, e.message))
}
