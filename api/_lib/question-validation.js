function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validateQuestionItems(items, label) {
  if (!Array.isArray(items)) throw validationError(`${label} must be an array.`);

  items.forEach((question, index) => {
    if (!question || typeof question !== 'object') {
      throw validationError(`${label}: question ${index + 1} is invalid.`);
    }
    if (question.type !== 'truefalse') return;

    const subItems = Array.isArray(question.subItems) ? question.subItems : [];
    if (subItems.length !== 4) {
      throw validationError(
        `${label}: true/false question "${question.id || index + 1}" must contain exactly 4 statements.`
      );
    }
    if (subItems.some(item => !item || !String(item.text || '').trim())) {
      throw validationError(
        `${label}: true/false question "${question.id || index + 1}" contains an empty statement.`
      );
    }
  });
}

function validateExamList(examList) {
  if (!examList || typeof examList !== 'object' || Array.isArray(examList)) {
    throw validationError('Exam list must be an object.');
  }
  Object.keys(examList).forEach(subject => {
    const exams = examList[subject];
    if (!Array.isArray(exams)) throw validationError(`Exam group "${subject}" must be an array.`);
    exams.forEach((exam, index) => {
      validateQuestionItems(
        exam && Array.isArray(exam.items) ? exam.items : [],
        `Exam "${(exam && (exam.title || exam.id)) || index + 1}"`
      );
    });
  });
}

module.exports = { validateExamList, validateQuestionItems };
