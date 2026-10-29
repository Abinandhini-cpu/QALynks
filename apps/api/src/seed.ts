import type { TestCaseInput } from '@qalynks/shared';
import type { TestCaseService } from './services/testCaseService';

const step = (action: string, expectedResult = '') => ({ action, expectedResult });

export const SAMPLE_TEST_CASES: TestCaseInput[] = [
  {
    title: 'Login with valid credentials',
    description: 'A registered user signs in with a correct email and password.',
    preconditions: 'A verified user account exists.',
    steps: [
      step('Open the login page', 'Login form is displayed'),
      step('Enter a valid email and password', 'Fields accept the input'),
      step('Click "Sign in"', 'User lands on the dashboard'),
    ],
    expectedResult: 'The user is authenticated and sees their dashboard.',
    priority: 'Critical',
    testType: 'Smoke',
    module: 'Authentication',
    tags: ['login', 'smoke'],
    status: 'Ready',
  },
  {
    title: 'Login rejected with wrong password',
    description: 'Sign-in fails safely when the password is incorrect.',
    preconditions: 'A verified user account exists.',
    steps: [
      step('Open the login page'),
      step('Enter a valid email and a wrong password'),
      step('Click "Sign in"', 'A generic error message is shown'),
    ],
    expectedResult: 'Access is denied and the error does not reveal which field was wrong.',
    priority: 'High',
    testType: 'Functional',
    module: 'Authentication',
    tags: ['login', 'negative'],
    status: 'Ready',
  },
  {
    title: 'Account locks after repeated failed logins',
    description: '',
    preconditions: 'Lockout threshold is configured to 5 attempts.',
    steps: [
      step('Submit a wrong password 5 times', 'Each attempt is rejected'),
      step('Submit the correct password', 'Account is locked message appears'),
    ],
    expectedResult: 'The account stays locked for the configured period.',
    priority: 'High',
    testType: 'Security',
    module: 'Authentication',
    tags: ['lockout'],
    status: 'Draft',
  },
  {
    title: 'Add a product to the cart',
    description: 'A shopper adds an in-stock product from the product page.',
    preconditions: 'At least one product is in stock.',
    steps: [
      step('Open a product page', 'Product details are shown'),
      step('Click "Add to cart"', 'Cart badge increases by one'),
    ],
    expectedResult: 'The cart contains the product with quantity 1.',
    priority: 'High',
    testType: 'Functional',
    module: 'Checkout',
    tags: ['cart'],
    status: 'Ready',
  },
  {
    title: 'Checkout with an expired card',
    description: '',
    preconditions: 'Cart contains one item.',
    steps: [
      step('Proceed to payment'),
      step('Enter a card with a past expiry date', 'Inline validation error appears'),
    ],
    expectedResult: 'The order is not placed and the user can correct the card details.',
    priority: 'Medium',
    testType: 'Functional',
    module: 'Checkout',
    tags: ['payment', 'negative'],
    status: 'Ready',
  },
  {
    title: 'Checkout page renders on a 360px wide screen',
    description: 'Layout check on a small mobile viewport.',
    preconditions: '',
    steps: [
      step('Open checkout at 360px width', 'No horizontal scrolling and all buttons reachable'),
    ],
    expectedResult: 'All checkout controls are usable on small screens.',
    priority: 'Medium',
    testType: 'UI',
    module: 'Checkout',
    tags: ['responsive'],
    status: 'Draft',
  },
  {
    title: 'Search returns results within 2 seconds',
    description: 'Response time check for the product search.',
    preconditions: 'Catalog holds at least 10,000 products.',
    steps: [
      step(
        'Search for a common keyword',
        'Results appear in under 2 seconds at the 95th percentile',
      ),
    ],
    expectedResult: 'Search meets the agreed response-time target.',
    priority: 'Medium',
    testType: 'Performance',
    module: 'Search',
    tags: ['latency'],
    status: 'Ready',
  },
  {
    title: 'Order history is unchanged after release',
    description: 'Regression check for previously placed orders.',
    preconditions: 'A user with at least 3 past orders.',
    steps: [
      step('Open the order history page', 'All past orders are listed'),
      step('Open the oldest order', 'Totals and line items match the original'),
    ],
    expectedResult: 'Historic orders display exactly as before the release.',
    priority: 'High',
    testType: 'Regression',
    module: 'Orders',
    tags: ['regression'],
    status: 'Ready',
  },
  {
    title: 'Orders API and payment gateway stay in sync',
    description: 'Confirms the order status updates when the gateway sends a webhook.',
    preconditions: 'Gateway sandbox is configured.',
    steps: [
      step('Place an order using the sandbox card', 'Order is created as Pending'),
      step('Trigger the payment-succeeded webhook', 'Order status becomes Paid'),
    ],
    expectedResult: 'Order status reflects the gateway outcome.',
    priority: 'Critical',
    testType: 'Integration',
    module: 'Orders',
    tags: ['payment', 'webhook'],
    status: 'Ready',
  },
  {
    title: 'Legacy coupon code entry',
    description: 'Replaced by the new promotions flow.',
    preconditions: '',
    steps: [step('Enter a legacy coupon at checkout')],
    expectedResult: 'Coupon is applied.',
    priority: 'Low',
    testType: 'Functional',
    module: 'Checkout',
    tags: [],
    status: 'Deprecated',
  },
];

/** Seeds sample data only when the database has no test cases. */
export function seedSampleData(service: TestCaseService): number {
  if (service.summary().total > 0) return 0;
  for (const sample of SAMPLE_TEST_CASES) service.create(sample);
  return SAMPLE_TEST_CASES.length;
}
