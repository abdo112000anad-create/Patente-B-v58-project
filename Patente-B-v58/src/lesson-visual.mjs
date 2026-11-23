export function resolveLessonVisual(lesson, questions) {
  const official = lesson?.visual_question_id
    ? questions.find(question => Number(question.id) === Number(lesson.visual_question_id)) || null
    : null;
  const officialImage = official?.image || '';
  const src = officialImage || lesson?.visual_src || '';
  return { official, src, isOfficialImage: !!officialImage };
}
