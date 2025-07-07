// ===============================================
//           استيراد المكتبات اللازمة
// ===============================================
const express = require("express");
const { Pool } = require("pg");
const path = require("path");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");

// ===============================================
//                 إعدادات التطبيق
// ===============================================
const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
    console.log("Created 'uploads' directory because it was missing.");
}

// ===============================================
//                البرمجيات الوسيطة (Middleware)
// ===============================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ===============================================
//          إعدادات الاتصال بقاعدة البيانات
// ===============================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});

// ===============================================
//          إعداد Multer لتخزين الملفات المرفوعة
// ===============================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const safeOriginalName = Buffer.from(
            file.originalname,
            "latin1",
        ).toString("utf8");
        cb(null, Date.now() + "-" + safeOriginalName);
    },
});
const upload = multer({ storage: storage });

// ===============================================
// ===== نقاط النهاية (API Endpoints) للمحتوى =====
// ===============================================
app.get("/api/grades", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM grades ORDER BY id");
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching grades:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});
app.get("/api/levels", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, name FROM grade_levels ORDER BY id",
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching all levels", err.stack);
        res.status(500).json({ message: "Server error when fetching levels" });
    }
});
app.get("/api/grades/:gradeId/levels", async (req, res) => {
    const { gradeId } = req.params;
    try {
        const result = await pool.query(
            "SELECT * FROM grade_levels WHERE grade_id = $1 ORDER BY id",
            [gradeId],
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching grade levels:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});
app.get("/api/levels/:levelId/units", async (req, res) => {
    const { levelId } = req.params;
    try {
        const result = await pool.query(
            "SELECT * FROM units WHERE grade_id = $1 ORDER BY id",
            [levelId],
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching units:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});
app.get("/api/units/:unitId/resources", async (req, res) => {
    const { unitId } = req.params;
    try {
        const result = await pool.query(
            "SELECT * FROM unit_resources WHERE unit_id = $1 ORDER BY category, id",
            [unitId],
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching unit resources:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});
app.get("/api/units/:unitId/videos", async (req, res) => {
    const { unitId } = req.params;
    try {
        const result = await pool.query(
            "SELECT * FROM videos WHERE unit_id = $1 ORDER BY id",
            [unitId],
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching videos:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});
//================================================================
// START: API Endpoint to GET Students by Grade ID
//================================================================

app.get('/api/teacher/grades/:gradeId/students', async (req, res) => {
    // 1. نستخرج رقم الصف الدراسي المطلوب من الرابط الذي أرسلته الواجهة الأمامية
    const { gradeId } = req.params;

    try {
        // 2. نكتب استعلام SQL ذكي جداً
        // هذا الاستعلام يربط جدول الطلاب "students" بجدول الصفوف "grade_levels"
        // ويقوم بتصفية النتائج ليجلب فقط الطلاب الذين ينتمون للصف المطلوب
        const query = `
            SELECT s.id, s.name 
            FROM students s
            JOIN grade_levels gl ON s.academic_stage = gl.name
            WHERE gl.id = $1
            ORDER BY s.name;
        `;

        // 3. نقوم بتنفيذ الاستعلام على قاعدة البيانات PostgreSQL
        const { rows } = await pool.query(query, [gradeId]);

        // 4. إذا نجح كل شيء، نرسل قائمة الطلاب (rows) إلى الواجهة الأمامية بصيغة JSON
        res.json(rows);

    } catch (err) {
        // 5. إذا حدث أي خطأ (في قاعدة البيانات مثلاً)، نقوم بتسجيله وإرسال رسالة خطأ
        console.error('ERROR FETCHING STUDENTS FOR GRADE:', err.message);
        res.status(500).json({ message: 'خطأ في السيرفر عند محاولة جلب الطلاب' });
    }
});

//================================================================
// END: API Endpoint
//================================================================
//================================================================
// START: API Endpoint to GET a Single Student's Activity
//================================================================

app.get('/api/teacher/student-activity/:studentId', async (req, res) => {
    // 1. نستخرج رقم الطالب المطلوب من الرابط
    const { studentId } = req.params;

    try {
        // 2. نكتب استعلام SQL لجلب كل الأنشطة المسجلة لهذا الطالب
        // مع ترتيبها من الأحدث إلى الأقدم
        const query = `
            SELECT 
                activity_type, 
                details, 
                activity_timestamp 
            FROM activity_log 
            WHERE student_id = $1 
            ORDER BY activity_timestamp DESC;
        `;

        // 3. ننفذ الاستعلام على قاعدة البيانات
        const { rows: activities } = await pool.query(query, [studentId]);

        // 4. *** الجزء الذكي: تجميع الأنشطة حسب الأسبوع ***
        const activityByWeek = {};

        activities.forEach(activity => {
            const date = new Date(activity.activity_timestamp);
            // نحصل على تاريخ بداية الأسبوع (يوم الاثنين)
            const weekStartDate = new Date(date.setDate(date.getDate() - date.getDay() + (date.getDay() === 0 ? -6 : 1)));
            const weekStartString = weekStartDate.toISOString().split('T')[0];

            if (!activityByWeek[weekStartString]) {
                const weekEndDate = new Date(weekStartDate);
                weekEndDate.setDate(weekEndDate.getDate() + 6);
                activityByWeek[weekStartString] = {
                    week_start_date: weekStartString,
                    week_end_date: weekEndDate.toISOString().split('T')[0],
                    activities: []
                };
            }

            // نحدد وصفاً بسيطاً للنشاط
            let description = activity.details;
            if (activity.activity_type === 'login') description = "قام بتسجيل الدخول";
            if (activity.activity_type === 'quiz_submit') description = `سلّم اختبار: ${activity.details}`;

            activityByWeek[weekStartString].activities.push({
                type: activity.activity_type,
                description: description
            });
        });

        // 5. نحول الكائن إلى مصفوفة ونرسله للواجهة الأمامية
        res.json(Object.values(activityByWeek));

    } catch (err) {
        console.error('ERROR FETCHING STUDENT ACTIVITY:', err.message);
        res.status(500).json({ message: 'خطأ في السيرفر عند جلب نشاط الطالب' });
    }
});

//================================================================
// END: API Endpoint
//================================================================

// ===============================================
// ===== ## START: ENDPOINTS للاختبارات (مُطورة) ## =====
// ===============================================

// جلب الاختبارات مع مدتها الزمنية
app.get("/api/levels/:levelId/quizzes", async (req, res) => {
    const { levelId } = req.params;
    try {
        const result = await pool.query(
            "SELECT id, title, quiz_type, duration_minutes FROM quizzes WHERE grade_id = $1 ORDER BY id",
            [levelId],
        );
        const groupedQuizzes = { final: [], monthly: [], quick: [] };
        result.rows.forEach((quiz) => {
            if (groupedQuizzes[quiz.quiz_type]) {
                groupedQuizzes[quiz.quiz_type].push(quiz);
            }
        });
        res.json(groupedQuizzes);
    } catch (error) {
        console.error("Error fetching and grouping quizzes:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// جلب تفاصيل الاختبار (الأسئلة والخيارات والدرجات)
app.get("/api/quizzes/:quizId", async (req, res) => {
    const { quizId } = req.params;
    try {
        const quizInfo = await pool.query(
            "SELECT id, title, duration_minutes FROM quizzes WHERE id = $1",
            [quizId],
        );
        if (quizInfo.rows.length === 0)
            return res.status(404).json({ message: "Quiz not found" });

        const questions = await pool.query(
            "SELECT id, question_text, question_type, points FROM questions WHERE quiz_id = $1 ORDER BY id",
            [quizId],
        );

        for (const question of questions.rows) {
            if (question.question_type === "mcq") {
                const options = await pool.query(
                    "SELECT id, option_text FROM question_options WHERE question_id = $1 ORDER BY id",
                    [question.id],
                );
                question.options = options.rows;
            }
        }
        res.json({ quiz: quizInfo.rows[0], questions: questions.rows });
    } catch (error) {
        console.error("Error fetching quiz details:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

// تسليم الإجابات (مع منطق التصحيح وحساب النتيجة)
app.post("/api/quizzes/:quizId/submit", upload.any(), async (req, res) => {
    const { quizId } = req.params;
    const { studentId, answers: answersJson, startTime } = req.body;
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // حساب النتيجة تلقائياً
        let totalScore = 0;
        const correctAnswers = await client.query(
            `
            SELECT q.id AS question_id, q.points, qo.id AS correct_option_id
            FROM questions q
            JOIN question_options qo ON q.id = qo.question_id
            WHERE q.quiz_id = $1 AND qo.is_correct = TRUE AND q.question_type = 'mcq'
        `,
            [quizId],
        );

        const correctAnswersMap = new Map(
            correctAnswers.rows.map((row) => [row.question_id, row]),
        );
        const parsedAnswers = JSON.parse(answersJson);

        for (const answer of parsedAnswers) {
            if (
                answer.selected_option_id &&
                correctAnswersMap.has(answer.questionId)
            ) {
                const correctAnswer = correctAnswersMap.get(answer.questionId);
                if (
                    parseInt(answer.selected_option_id) ===
                    correctAnswer.correct_option_id
                ) {
                    totalScore += correctAnswer.points;
                }
            }
        }

        // تسجيل المحاولة مع النتيجة والتوقيتات
        const attemptResult = await client.query(
            `INSERT INTO quiz_attempts (quiz_id, student_id, score, start_time, end_time) 
             VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
            [quizId, studentId, totalScore, new Date(parseInt(startTime))],
        );
        const attemptId = attemptResult.rows[0].id;

        // تسجيل إجابات الطالب التفصيلية
        for (const answer of parsedAnswers) {
            let fileUrl = null;
            if (req.files && Array.isArray(req.files)) {
                const uploadedFile = req.files.find(
                    (f) => f.fieldname === `question_${answer.questionId}_file`,
                );
                if (uploadedFile) {
                    fileUrl = `/uploads/${uploadedFile.filename}`;
                }
            }
            await client.query(
                `INSERT INTO student_answers (attempt_id, question_id, answer_text, selected_option_id, file_url) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    attemptId,
                    answer.questionId,
                    answer.answer_text,
                    answer.selected_option_id,
                    fileUrl,
                ],
            );
        }
        // ================================================================
        // ## START: الكود الجديد لحساب الدرجة النهائية للاختبار ##
        // ================================================================
        const totalPossibleScoreQuery = `
            SELECT SUM(points) as total_score
            FROM questions
            WHERE quiz_id = $1 AND question_type = 'mcq'
        `;
        const totalScoreResult = await client.query(totalPossibleScoreQuery, [quizId]);
        // نستخدم || 0 في حالة عدم وجود أسئلة اختيارية لتجنب الأخطاء
        const totalPossibleScore = totalScoreResult.rows[0].total_score || 0;
        // ================================================================
        // ## END: الكود الجديد ##
        // ================================================================
        await client.query("COMMIT");
        res.json({
            success: true,
            message: "تم تسليم إجاباتك بنجاح!",
            score: totalScore,
            totalPossibleScore: totalPossibleScore // <-- الإضافة الجديدة هنا
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("SERVER CRASH ON QUIZ SUBMIT:", error);
        res.status(500).json({
            success: false,
            message: "حدث خطأ فادح في السيرفر أثناء تسجيل الإجابات.",
        });
    } finally {
        client.release();
    }
});
// ===== ## END: ENDPOINTS للاختبارات (مُطورة) ## =====

// ===== ## START: ENDPOINTS للوحة تحكم المدرس (جديدة) ## =====
app.get("/api/teacher/quizzes", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                q.id, 
                q.title, 
                q.quiz_type, 
                gl.id AS grade_level_id, 
                gl.name AS grade_level_name 
            FROM quizzes q
            JOIN grade_levels gl ON q.grade_id = gl.id
            ORDER BY gl.id, q.id DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching teacher quizzes:", error);
        res.status(500).send("Server Error");
    }
});

app.get("/api/teacher/quiz-results/:quizId", async (req, res) => {
    const { quizId } = req.params;
    try {
        const result = await pool.query(
            `
            SELECT 
                qa.id AS attempt_id,
                s.name AS student_name,
                s.email AS student_email,
                qa.score,
                qa.start_time,
                qa.end_time
            FROM quiz_attempts qa
            JOIN students s ON qa.student_id = s.id
            WHERE qa.quiz_id = $1
            ORDER BY qa.end_time DESC;
        `,
            [quizId],
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching quiz results:", error);
        res.status(500).send("Server Error");
    }
});

app.get("/api/teacher/attempt-details/:attemptId", async (req, res) => {
    const { attemptId } = req.params;
    try {
        const result = await pool.query(
            `
            SELECT 
                q.question_text,
                q.points,
                sa.answer_text,
                sa.file_url,
                qo.option_text AS selected_option,
                correct_qo.option_text AS correct_option
            FROM student_answers sa
            JOIN questions q ON sa.question_id = q.id
            LEFT JOIN question_options qo ON sa.selected_option_id = qo.id
            LEFT JOIN (
                SELECT question_id, option_text FROM question_options WHERE is_correct = TRUE
            ) AS correct_qo ON q.id = correct_qo.question_id
            WHERE sa.attempt_id = $1
            ORDER BY q.id;
        `,
            [attemptId],
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching attempt details:", error);
        res.status(500).send("Server Error");
    }
});
// ===== ## END: ENDPOINTS للوحة تحكم المدرس (جديدة) ## =====

//================================================================
// START: FINAL AND CORRECTED Login API Endpoint
//================================================================

app.post('/api/login', async (req, res) => {
    // 1. نقرأ الإيميل من جسم الطلب (req.body) - هذا هو التصحيح الأهم
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'البريد الإلكتروني مطلوب' });
    }

    try {
        // 2. نبحث عن الطالب في قاعدة بياناتك الحقيقية
        const studentResult = await pool.query('SELECT * FROM students WHERE email = $1', [email]);

        if (studentResult.rows.length === 0) {
            return res.status(404).json({ message: 'البريد الإلكتروني غير مسجل' });
        }

        const student = studentResult.rows[0];

        // 3. نسجل نشاط الدخول في قاعدة بياناتك الحقيقية
        await pool.query(
            'INSERT INTO activity_log (student_id, activity_type, details) VALUES ($1, $2, $3)',
            [student.id, 'login', 'قام بتسجيل الدخول']
        );

        // 4. نرسل رداً ناجحاً بمعلومات الطالب
        res.status(200).json({
            id: student.id,
            name: student.name,
            academicStage: student.academic_stage,
            isTeacher: student.is_teacher
        });

    } catch (err) {
        console.error('LOGIN ERROR:', err.message);
        res.status(500).json({ message: 'خطأ في السيرفر أثناء تسجيل الدخول' });
    }
});

//================================================================
// END: FINAL AND CORRECTED Login API Endpoint
//================================================================
//================================================================
// START: API Endpoint to GET All Dashboard Stats
//================================================================
app.get('/api/teacher/dashboard-stats', async (req, res) => {
    try {
        // 1. حساب إجمالي الطلاب
        const studentsQuery = 'SELECT COUNT(id) AS total_students FROM students WHERE is_teacher = false';
        const studentsResult = await pool.query(studentsQuery);

        // 2. حساب إجمالي الاختبارات
        const quizzesQuery = 'SELECT COUNT(id) AS total_quizzes FROM quizzes';
        const quizzesResult = await pool.query(quizzesQuery);

        // 3. حساب متوسط الأداء (مع تجاهل القيم الفارغة)
        const avgQuery = 'SELECT COALESCE(ROUND(AVG(score)), 0) AS average_performance FROM quiz_attempts';
        const avgResult = await pool.query(avgQuery);

        // 4. حساب أنشطة اليوم (آخر 24 ساعة)
        const activityQuery = "SELECT COUNT(id) AS today_activity FROM activity_log WHERE activity_timestamp >= NOW() - interval '1 day'";
        const activityResult = await pool.query(activityQuery);

        // 5. تجميع كل النتائج في كائن واحد
        const stats = {
            total_students: studentsResult.rows[0].total_students,
            total_quizzes: quizzesResult.rows[0].total_quizzes,
            average_performance: avgResult.rows[0].average_performance,
            today_activity: activityResult.rows[0].today_activity,
        };

        // 6. إرسال الإحصائيات إلى الواجهة الأمامية
        res.json(stats);

    } catch (err) {
        console.error('ERROR FETCHING DASHBOARD STATS:', err.message);
        res.status(500).json({ message: 'خطأ في السيرفر عند جلب الإحصائيات' });
    }
});
//================================================================
// END: API Endpoint
//================================================================
//================================================================
// START: API Endpoints for Stat Card Details
//================================================================

// 1. Endpoint to get the list of all students
app.get('/api/teacher/stats/all-students', async (req, res) => {
    try {
        const result = await pool.query('SELECT name, email, academic_stage FROM students WHERE is_teacher = false ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: "Error fetching students list" });
    }
});

// 2. Endpoint to get the list of all quizzes

// 3. Endpoint to get today's activity log
app.get('/api/teacher/stats/today-activities', async (req, res) => {
    try {
        const query = `
            SELECT u.name, u.academic_stage, a.details, a.activity_timestamp
            FROM activity_log a
            JOIN students u ON a.student_id = u.id
            WHERE a.activity_timestamp >= NOW() - interval '1 day'
            ORDER BY a.activity_timestamp DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: "Error fetching today's activities" });
    }
});

//================================================================
// END: API Endpoints for Stat Card Details
//================================================================
// ================================================================
// START: API Endpoint for Performance Details (NEW & POWERFUL)
// ================================================================
app.get('/api/teacher/stats/performance-details', async (req, res) => {
    try {
        // هذا الاستعلام هو قلب الميزة الجديدة، فهو يجمع كل ما نحتاجه
        const query = `
            SELECT
                s.id AS student_id,
                s.name AS student_name,
                s.academic_stage AS student_grade,
                q.id AS quiz_id,
                q.title AS quiz_title,
                qa.score AS score_achieved,
                -- هذا الجزء الذكي يقوم بحساب مجموع درجات الأسئلة الاختيارية فقط لكل اختبار
                (
                    SELECT SUM(points)
                    FROM questions
                    WHERE quiz_id = q.id AND question_type = 'mcq'
                ) AS total_possible_score,
                qa.end_time
            FROM quiz_attempts qa
            JOIN students s ON qa.student_id = s.id
            JOIN quizzes q ON qa.quiz_id = q.id
            WHERE s.is_teacher = false -- لا نعرض أداء المدرسين
            ORDER BY s.academic_stage, s.name, qa.end_time; -- نرتب حسب الصف ثم الاسم ثم وقت التسليم
        `;

        const { rows } = await pool.query(query);
        res.json(rows);

    } catch (err) {
        console.error('ERROR FETCHING PERFORMANCE DETAILS:', err.message);
        res.status(500).json({ message: 'خطأ في السيرفر عند جلب تفاصيل الأداء' });
    }
});
// ================================================================
// END: API Endpoint for Performance Details
// ================================================================
// START: CORRECT AND FINAL VERSION for All Quizzes Endpoint
// ================================================================
app.get('/api/teacher/stats/all-quizzes', async (req, res) => {
    try {
        // هذا الاستعلام هو الصحيح، حيث يربط الاختبارات بالصفوف الدراسية لجلب أسمائها
        const result = await pool.query(`
            SELECT 
                q.title, 
                gl.name AS grade_name 
            FROM quizzes q
            JOIN grade_levels gl ON q.grade_id = gl.id
            ORDER BY gl.id, q.title
        `);
        // نتأكد من إرسال البيانات كـ JSON
        res.json(result.rows);
    } catch (err) {
        // في حالة حدوث أي خطأ، نسجله ونرسل رسالة خطأ واضحة
        console.error("CRITICAL ERROR fetching all quizzes list:", err.message);
        res.status(500).json({ message: "Server Error: Could not fetch quizzes list." });
    }
});
// ================================================================
// END: CORRECT AND FINAL VERSION for All Quizzes Endpoint
// ================================================================

// --- START: Improved Function to Show All Quizzes (with better error handling) ---
async function showAllQuizzes() {
    try {
        const response = await fetch(`${API_BASE_URL}/teacher/stats/all-quizzes`);

        // التحقق مما إذا كانت استجابة الخادم ناجحة
        if (!response.ok) {
            throw new Error(`فشل الاتصال بالخادم، رمز الحالة: ${response.status}`);
        }

        const quizzes = await response.json();
        console.log("تم جلب الاختبارات بنجاح:", quizzes); // للتأكد من وصول البيانات

        if (!quizzes || quizzes.length === 0) {
            showStatsModal('قائمة كل الاختبارات', '<p>لا توجد أي اختبارات متاحة حالياً في المنصة.</p>');
            return;
        }

        let listHtml = '<ul style="list-style-type: none; padding-right: 0;">';
        quizzes.forEach(q => {
            // التحقق من وجود البيانات قبل عرضها لتجنب الأخطاء
            const title = q.title || 'اختبار بدون عنوان';
            const grade = q.grade_name || 'صف غير محدد';
            listHtml += `<li style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${title}</strong> (${grade})</li>`;
        });
        listHtml += '</ul>';

        showStatsModal('قائمة كل الاختبارات', listHtml);

    } catch (error) {
        // هذا الجزء سيظهر لنا أي خطأ يحدث بالتفصيل في الـ Console
        console.error("حدث خطأ في الواجهة الأمامية عند جلب الاختبارات:", error);
        showStatsModal('خطأ', `<p style="color: red;">لا يمكن عرض قائمة الاختبارات حالياً. يرجى مراجعة الـ Console لمزيد من التفاصيل.</p><p>${error.message}</p>`);
    }
}
// --- END: Improved Function to Show All Quizzes ---
//================================================================
// START: FINAL AND CORRECTED Quiz Submission API with Activity Logging
//================================================================

app.post('/api/quizzes/:quizId/submit', (req, res) => {
    const form = formidable({ multiples: true, uploadDir: uploadsDir, keepExtensions: true });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Formidable parsing error:', err);
            return res.status(500).json({ message: 'خطأ في معالجة البيانات' });
        }

        try {
            // 1. نستخرج البيانات من الأماكن الصحيحة
            const quizId = req.params.quizId;
            const studentId = fields.studentId[0]; // **هذا هو التصحيح الأهم**
            const answers = JSON.parse(fields.answers[0]);
            const startTime = fields.startTime[0];
            const endTime = Date.now();

            // 2. نقوم بحفظ إجابات الطالب في قاعدة البيانات (هذا الكود يجب أن يكون لديك بالفعل)
            // ... (من المفترض أن لديك هنا كود لحفظ الإجابات وحساب الدرجات)
            // For example:
            // for (const answer of answers) {
            //     await pool.query('INSERT INTO answers ...');
            // }

            // 3. *** الجزء الجديد والمهم: تسجيل النشاط ***
            // أولاً، نجلب اسم الاختبار
            const quizTitleResult = await pool.query('SELECT title FROM quizzes WHERE id = $1', [quizId]);

            if (quizTitleResult.rows.length > 0) {
                const quizTitle = quizTitleResult.rows[0].title;

                // ثانياً، نسجل النشاط في سجل الأنشطة
                await pool.query(
                    'INSERT INTO activity_log (student_id, activity_type, details) VALUES ($1, $2, $3)',
                    [studentId, 'quiz_submit', `سلّم اختبار: ${quizTitle}`]
                );
                console.log(`Activity logged: Student ${studentId} submitted quiz "${quizTitle}"`);
            }

            // 4. نرسل الرد النهائي للواجهة الأمامية
            res.status(200).json({ 
                message: 'تم تسليم الاختبار وتسجيل النشاط بنجاح!',
                score: 'XX' // (هنا تضع ناتج حساب الدرجات الخاص بك)
            });

        } catch (dbErr) {
            console.error('QUIZ SUBMISSION DATABASE ERROR:', dbErr.message);
            res.status(500).json({ message: 'خطأ في السيرفر أثناء حفظ تسليم الاختبار' });
        }
    });
});

//================================================================
// END: FINAL AND CORRECTED Quiz Submission API
//================================================================);

//================================================================
// END: CORRECTED Quiz Submission API
//================================================================

// ===============================================
//              نقاط النهاية العامة
// ===============================================
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, "0.0.0.0", () => {
    console.log(
        `السيرفر يعمل الآن على http://localhost:${port} أو على رابط الاستضافة`,
    );
});
