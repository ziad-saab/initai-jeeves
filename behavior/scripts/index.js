'use strict';

const MIN_CONFIDENCE = 0.15;

exports.handle = (client) => {
  // Helpers
  function requireHuman() {
    client.updateConversationState({
      needsHuman: true
    });
    client.done();
  }

  function shouldWaitForNurse(state) {
    return (
      !state.questions
      || state.needsHuman
      || state.questions.every(q => !!q.answer)
    );
  }

  // Create steps
  const waitForNurse = client.createStep({
    satisfied() {
      console.log('should wait?');
      console.log ('should wait: ', shouldWaitForNurse(client.getConversationState()));
      return !shouldWaitForNurse(client.getConversationState());
    },

    prompt() {
      if (!client.getConversationState().questions) {
        /*
        @ NOTE: THIS PART IS ONLY HERE FOR TESTING!!!
        Eventually, the questions will be added using an [Inbound Event](https://docs.init.ai/docs/events)
        */
        console.log('add questions');
        client.updateConversationState({
          questions: [
            {
              ask: 'do_you_smoke',
              accept: ['affirmative', 'decline', 'smoking_answer']
            },
            {
              ask: 'any_medications',
              accept: ['affirmative', 'decline', 'medication_answer']
            }
          ]
        });
      }
      client.done();
    }
  });

  const askQuestions = client.createStep({
    satisfied() {
      console.log('ask questions')
      return client.getConversationState().questions.every(
        q => typeof q.answer !== 'undefined'
      );
    },

    prompt() {
      const questions = client.getConversationState().questions;
      const messagePart = client.getMessagePart();
      const confidence = messagePart.confidence;

      // If confidence is too low, signal the nurse
      if (confidence < MIN_CONFIDENCE) {
        console.log('too low conf', confidence, MIN_CONFIDENCE);
        requireHuman();
        return;
      }

      // Check if we were asking a question
      const currentQuestion = questions.find(q => q.isAsking);
      if (currentQuestion) {
        const baseType = messagePart.classification.base_type.value;

        // If we were asking a question, and the answer's classification is unexpected, signal the nurse
        if (currentQuestion.accept && !currentQuestion.accept.includes(baseType)) {
          console.log('not accepted', baseType, currentQuestion.accept);
          requireHuman();
          return;
        }

        // If we get here, then we have a satisfactory answer, move on!
        currentQuestion.isAsking = false;
        currentQuestion.answer = messagePart.content;
      }

      // Setup the next question if there is one
      const nextQuestion = questions.find(q => !q.answer);
      if (nextQuestion) {
        nextQuestion.isAsking = true;
        client.addResponse(`ask_question/${nextQuestion.ask}`);
      }

      // Update the convo state with any answers / new questions
      client.updateConversationState({
        questions
      });

      client.done();
    }
  })

  client.runFlow({
    classifications: {
      // map inbound message classifications to names of streams
    },
    streams: {
      main: 'loop',
      loop: [waitForNurse, askQuestions]
    },
  })
}
