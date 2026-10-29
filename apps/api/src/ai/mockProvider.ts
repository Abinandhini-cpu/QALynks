import type { AiResponse } from '@qalynks/shared';
import type { LlmProvider } from './provider';

/**
 * Canned provider for browser tests and offline demos only. It does not read
 * the requirement and is not AI. The API refuses to use it in production.
 */
export class MockProvider implements LlmProvider {
  readonly name = 'mock';
  readonly model = 'canned-output';
  readonly mock = true;

  async generateStructured(): Promise<AiResponse> {
    return {
      analysis: {
        summary: 'Canned analysis from the mock provider. This is not AI output.',
        features: ['Account sign-in'],
        businessRules: ['A registered user can sign in with an email and password'],
        acceptanceCriteria: ['Valid credentials open the dashboard'],
        validations: ['Email and password are required'],
        dependencies: [],
        errorScenarios: ['Wrong password shows an error'],
        ambiguities: ['The requirement does not state a lockout rule'],
        missingInformation: ['Password length limits are not specified'],
        contradictions: [],
        assumptions: [],
      },
      testCases: [
        {
          module: 'Authentication',
          summary: 'Sign in with valid credentials',
          steps: ['Open the sign-in page', 'Enter the email and password', 'Select Sign in'],
          testData:
            'Email: [Not specified: registered email]; Password: [Not specified: matching password]',
          expectedResult: 'The user is signed in and the dashboard opens',
          scenarioType: 'positive',
          priority: 'High',
          testType: 'Functional',
          needsClarification: false,
          clarificationNote: '',
          sourceReference: 'Valid credentials open the dashboard',
        },
        {
          module: 'Authentication',
          summary: 'Sign in with a wrong password',
          steps: [
            'Open the sign-in page',
            'Enter a valid email and a wrong password',
            'Select Sign in',
          ],
          testData:
            'Email: [Not specified: registered email]; Password: [Not specified: incorrect password]',
          expectedResult: 'An error message is shown and the user is not signed in',
          scenarioType: 'negative',
          priority: 'High',
          testType: 'Functional',
          needsClarification: false,
          clarificationNote: '',
          sourceReference: 'Wrong password shows an error',
        },
        {
          module: '',
          summary: 'Account behaviour after repeated failed sign-ins',
          steps: ['Submit a wrong password repeatedly'],
          testData: '[Not specified: number of attempts before any lockout]',
          expectedResult: 'To be confirmed: the requirement does not define a lockout rule',
          scenarioType: 'edge',
          priority: 'Medium',
          testType: 'Security',
          needsClarification: true,
          clarificationNote: 'No lockout rule is stated in the requirement',
          sourceReference: 'Not covered by the requirement',
        },
      ],
    };
  }
}
