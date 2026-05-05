export const quizResetEventName = 'giftmatch:quiz-reset';

export function requestQuizReset() {
  window.dispatchEvent(new Event(quizResetEventName));
}
