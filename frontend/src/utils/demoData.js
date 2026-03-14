// ─────────────────────────────────────────────────────────────────
// Demo / Marketing Mode — all hardcoded data lives here
// ─────────────────────────────────────────────────────────────────

// ── Constants ────────────────────────────────────────────────────
export const DEMO_SESSION_ID = 'DEMO01';

export const DEMO_USER = {
  id: 9999,
  email: '999999@sastra.ac.in',
  fullName: 'Demo Student',
  full_name: 'Demo Student',
  role: 'student',
};

export const DEMO_SESSION = {
  id: 1,
  session_id: DEMO_SESSION_ID,
  title: 'Data Structures & Algorithms',
  course_name: 'CS201',
  description: 'Introduction to fundamental data structures and algorithm analysis.',
  teacher_id: 1,
  teacher_name: 'Dr. Rajesh Kumar',
  is_active: true,
  created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  updated_at: new Date().toISOString(),
};

export const DEMO_POLLS = [
  {
    id: 1001,
    session_id: DEMO_SESSION_ID,
    question: 'Which data structure uses LIFO (Last In, First Out) order?',
    options: ['Queue', 'Stack', 'Array', 'Tree'],
    correct_answer: 1,
    time_limit: 15,
    justification:
      'A Stack follows LIFO — the last element pushed is the first to be popped, making it ideal for undo operations, function call tracking, and expression parsing.',
    is_active: false,
    activated_at: null,
  },
  {
    id: 1002,
    session_id: DEMO_SESSION_ID,
    question: 'What is the time complexity of binary search?',
    options: ['O(n)', 'O(n²)', 'O(log n)', 'O(1)'],
    correct_answer: 2,
    time_limit: 15,
    justification:
      'Binary search halves the search space at every step, giving O(log n) time — far more efficient than O(n) linear search for large sorted datasets.',
    is_active: false,
    activated_at: null,
  },
];

export const DEMO_RESOURCES = [
  {
    id: 1,
    session_id: DEMO_SESSION_ID,
    title: 'Data Structures Cheat Sheet',
    resource_type: 'pdf',
    file_url: 'https://www.cs.bgu.ac.il/~ds162/wiki.files/ds-ps.pdf',
    description: 'Quick reference for stacks, queues, trees, graphs and their complexities.',
    summary: 'Covers Big-O notation, stack/queue operations, BST traversal, heap properties, and graph BFS/DFS.',
    extractive_keywords: ['stack', 'queue', 'tree', 'graph', 'Big-O', 'complexity'],
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 2,
    session_id: DEMO_SESSION_ID,
    title: 'Visualgo – Interactive Animations',
    resource_type: 'link',
    file_url: 'https://visualgo.net/en',
    description: 'See data structures come alive with step-by-step visual simulations.',
    summary: 'Interactive visualisations of sorting, searching, linked lists, trees, and graphs.',
    extractive_keywords: ['visualisation', 'sorting', 'binary search', 'linked list'],
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 3,
    session_id: DEMO_SESSION_ID,
    title: 'Lecture Notes: Complexity Analysis',
    resource_type: 'note',
    file_url: null,
    content:
      'Big O Notation:\n• O(1)      – Constant\n• O(log n)  – Logarithmic\n• O(n)      – Linear\n• O(n log n)– Linearithmic\n• O(n²)     – Quadratic\n\nStack: push O(1), pop O(1)\nQueue: enqueue O(1), dequeue O(1)\nBinary Search Tree: search O(log n) avg, O(n) worst\nHeap (insert/delete): O(log n)',
    description: 'In-class notes covering time and space complexity for common data structure operations.',
    summary: 'Summary of time complexities for all major data structures.',
    extractive_keywords: ['Big O', 'stack', 'queue', 'BST', 'heap', 'complexity'],
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const DEMO_PARTICIPANTS = [
  { id: 9999, full_name: 'Demo Student', email: '999999@sastra.ac.in', is_active: true },
  { id: 1001, full_name: 'Arun Krishnan', email: '112345@sastra.ac.in', is_active: true },
  { id: 1002, full_name: 'Priya Sundaram', email: '112346@sastra.ac.in', is_active: true },
  { id: 1003, full_name: 'Karthik Rajan', email: '112347@sastra.ac.in', is_active: true },
  { id: 1004, full_name: 'Divya Menon', email: '112348@sastra.ac.in', is_active: true },
  { id: 1005, full_name: 'Vijay Anand', email: '112349@sastra.ac.in', is_active: true },
  { id: 1006, full_name: 'Sowmya Nair', email: '112350@sastra.ac.in', is_active: false },
  { id: 1007, full_name: 'Surya Prakash', email: '112351@sastra.ac.in', is_active: true },
];

export const DEMO_DASHBOARD = {
  sessions: [
    {
      session_id: 1,
      join_code: DEMO_SESSION_ID,
      title: 'Data Structures & Algorithms',
      course_name: 'CS201',
      teacher_name: 'Dr. Rajesh Kumar',
      is_active: true,
      is_live: true,
      joined_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      participation_active: true,
    },
    {
      session_id: 2,
      join_code: 'OOP101',
      title: 'Object-Oriented Programming',
      course_name: 'CS102',
      teacher_name: 'Prof. Meera Iyer',
      is_active: false,
      joined_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      participation_active: false,
    },
  ],
  stats: {
    sessions_joined: 5,
    polls_answered: 18,
    correct_answers: 14,
    active_sessions: 1,
    average_score: 78,
  },
  recentActivity: [
    {
      activity_type: 'poll_answered',
      title: 'Answered poll in Object-Oriented Programming',
      activity_time: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      result: 'Correct',
    },
    {
      activity_type: 'session_joined',
      title: 'Joined Data Structures & Algorithms',
      activity_time: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      result: null,
    },
  ],
  activePolls: [],
};

export const DEMO_GAMIFICATION = {
  totalPoints: 150,
  rank: 3,
  totalStudents: 45,
  currentStreak: 5,
  totalXP: 420,
  level: {
    level: 3,
    title: 'Consistent',
    currentXP: 420,
    nextLevelXP: 600,
    xpToNextLevel: 180,
  },
  badges: [
    { id: 'streak_5', name: 'Streak Champion', badge_type: 'streak_5', badge_tier: 'silver', badge_category: 'streak', earned_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'accuracy_bronze', name: 'Sharp Shooter', badge_type: 'accuracy_bronze', badge_tier: 'bronze', badge_category: 'accuracy', earned_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'participation_bronze', name: 'Active Learner', badge_type: 'participation_bronze', badge_tier: 'bronze', badge_category: 'participation', earned_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
  ],
};

export const DEMO_GAMIFICATION_XP = {
  totalXP: 420,
  level: {
    level: 3,
    title: 'Consistent',
    currentXP: 420,
    nextLevelXP: 600,
    xpToNextLevel: 180,
  },
  history: [
    { xp_type: 'session_participation', xp_amount: 20, earned_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() },
    { xp_type: 'poll_correct', xp_amount: 10, earned_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    { xp_type: 'poll_correct', xp_amount: 10, earned_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
    { xp_type: 'knowledge_card', xp_amount: 15, earned_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() },
    { xp_type: 'session_participation', xp_amount: 20, earned_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
  ],
};

export const DEMO_SESSION_SUMMARY = {
  rank: 2,
  totalStudents: 12,
  accuracy: 83,
  pointsEarned: 67,
  xpGained: 45,
  badgesEarned: ['accuracy_bronze'],
  sessionTitle: 'Data Structures & Algorithms',
  pollsAnswered: 5,
  pollsCorrect: 4,
  streakMax: 3,
};

export const DEMO_LEADERBOARD = [
  { rank: 1, studentId: 1001, studentName: 'Priya Sundaram', totalPoints: 220, points: 220, correctAnswers: 19, totalAnswers: 22, currentStreak: 4, maxStreak: 6, sessionsParticipated: 5, avgAccuracy: 86, totalXP: 680, level: { level: 4, title: 'Dedicated' } },
  { rank: 2, studentId: 1002, studentName: 'Arun Krishnan', totalPoints: 185, points: 185, correctAnswers: 16, totalAnswers: 20, currentStreak: 2, maxStreak: 5, sessionsParticipated: 5, avgAccuracy: 80, totalXP: 530, level: { level: 3, title: 'Consistent' } },
  { rank: 3, studentId: 9999, studentName: 'Demo Student', totalPoints: 150, points: 150, correctAnswers: 14, totalAnswers: 18, currentStreak: 5, maxStreak: 5, sessionsParticipated: 5, avgAccuracy: 78, totalXP: 420, level: { level: 3, title: 'Consistent' } },
  { rank: 4, studentId: 1003, studentName: 'Karthik Rajan', totalPoints: 140, points: 140, correctAnswers: 13, totalAnswers: 18, currentStreak: 1, maxStreak: 3, sessionsParticipated: 4, avgAccuracy: 72, totalXP: 360, level: { level: 3, title: 'Consistent' } },
  { rank: 5, studentId: 1004, studentName: 'Divya Menon', totalPoints: 120, points: 120, correctAnswers: 11, totalAnswers: 16, currentStreak: 0, maxStreak: 3, sessionsParticipated: 4, avgAccuracy: 69, totalXP: 280, level: { level: 2, title: 'Active Learner' } },
  { rank: 6, studentId: 1005, studentName: 'Vijay Anand', totalPoints: 105, points: 105, correctAnswers: 10, totalAnswers: 15, currentStreak: 2, maxStreak: 2, sessionsParticipated: 3, avgAccuracy: 67, totalXP: 230, level: { level: 2, title: 'Active Learner' } },
  { rank: 7, studentId: 1006, studentName: 'Sowmya Nair', totalPoints: 90, points: 90, correctAnswers: 8, totalAnswers: 14, currentStreak: 0, maxStreak: 2, sessionsParticipated: 3, avgAccuracy: 57, totalXP: 180, level: { level: 2, title: 'Active Learner' } },
  { rank: 8, studentId: 1007, studentName: 'Surya Prakash', totalPoints: 75, points: 75, correctAnswers: 7, totalAnswers: 13, currentStreak: 1, maxStreak: 2, sessionsParticipated: 3, avgAccuracy: 54, totalXP: 140, level: { level: 2, title: 'Active Learner' } },
  { rank: 9, studentId: 1008, studentName: 'Lakshmi Rao', totalPoints: 60, points: 60, correctAnswers: 5, totalAnswers: 11, currentStreak: 0, maxStreak: 1, sessionsParticipated: 2, avgAccuracy: 45, totalXP: 90, level: { level: 1, title: 'Newcomer' } },
  { rank: 10, studentId: 1009, studentName: 'Venkat Subbu', totalPoints: 45, points: 45, correctAnswers: 4, totalAnswers: 10, currentStreak: 0, maxStreak: 1, sessionsParticipated: 2, avgAccuracy: 40, totalXP: 60, level: { level: 1, title: 'Newcomer' } },
];

export const DEMO_SESSION_LEADERBOARD = [
  { rank: 1, studentId: 1001, studentName: 'Priya Sundaram', points: 67, correctAnswers: 5, totalAnswers: 6, currentStreak: 3, maxStreak: 3, totalXP: 680, level: { level: 4, title: 'Dedicated' } },
  { rank: 2, studentId: 9999, studentName: 'Demo Student', points: 55, correctAnswers: 4, totalAnswers: 6, currentStreak: 2, maxStreak: 3, totalXP: 420, level: { level: 3, title: 'Consistent' } },
  { rank: 3, studentId: 1002, studentName: 'Arun Krishnan', points: 48, correctAnswers: 4, totalAnswers: 6, currentStreak: 1, maxStreak: 2, totalXP: 530, level: { level: 3, title: 'Consistent' } },
  { rank: 4, studentId: 1003, studentName: 'Karthik Rajan', points: 39, correctAnswers: 3, totalAnswers: 5, currentStreak: 0, maxStreak: 2, totalXP: 360, level: { level: 3, title: 'Consistent' } },
  { rank: 5, studentId: 1004, studentName: 'Divya Menon', points: 30, correctAnswers: 2, totalAnswers: 5, currentStreak: 0, maxStreak: 1, totalXP: 280, level: { level: 2, title: 'Active Learner' } },
];

export const DEMO_KNOWLEDGE_CARDS = {
  round: {
    id: 1,
    session_id: 1,
    status: 'active',
    total_pairs: 5,
    created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
  pairs: [
    { id: 101, question_text: 'What is the time complexity of inserting into a max-heap?', answer_text: 'O(log n) — the element bubbles up from the leaf, traversing at most the height of the tree.', difficulty: 2, status: 'completed', question_holder_id: 1001, answer_holder_id: 1002, order_index: 0 },
    { id: 102, question_text: 'What data structure would you use to implement a browser\'s back button?', answer_text: 'A Stack — each visited page is pushed; the back button pops the top page off the stack.', difficulty: 1, status: 'active', question_holder_id: 9999, answer_holder_id: 1003, order_index: 1 },
    { id: 103, question_text: 'What is the difference between BFS and DFS traversal?', answer_text: 'BFS uses a Queue and explores level by level; DFS uses a Stack (or recursion) and explores as deep as possible before backtracking.', difficulty: 2, status: 'pending', question_holder_id: 1004, answer_holder_id: 9999, order_index: 2 },
    { id: 104, question_text: 'When would you choose a linked list over an array?', answer_text: 'When you need O(1) insertions/deletions at the head or middle and don\'t require random access by index.', difficulty: 1, status: 'pending', question_holder_id: 1002, answer_holder_id: 1001, order_index: 3 },
    { id: 105, question_text: 'What is a balanced BST and why does balance matter?', answer_text: 'A balanced BST keeps height at O(log n). Without balance, worst-case search degrades to O(n) (e.g., a sorted insertion into a plain BST creates a linked list).', difficulty: 3, status: 'pending', question_holder_id: 1003, answer_holder_id: 1004, order_index: 4 },
  ],
  // What the demo student (9999) holds:
  studentCard: {
    questions: [
      { pairId: 102, questionText: 'What data structure would you use to implement a browser\'s back button?', difficulty: 1, orderIndex: 1 },
    ],
    answers: [
      { pairId: 103, answerText: 'BFS uses a Queue and explores level by level; DFS uses a Stack (or recursion) and explores as deep as possible before backtracking.', difficulty: 2 },
    ],
  },
  activeState: {
    type: 'question',
    pairId: 102,
    questionHolderId: 9999,
    answerHolderId: 1003,
  },
};

const now = new Date();
export const DEMO_AI_CHAT = [
  {
    id: 'demo_welcome',
    type: 'assistant',
    content: "Hi! I'm your AI study assistant. Ask me anything about the course materials — try asking me to list resources, summarise a file, or explain a concept!",
    timestamp: new Date(now.getTime() - 5 * 60 * 1000),
    searchResults: [],
  },
  {
    id: 'demo_user_1',
    type: 'user',
    content: 'List all resources',
    timestamp: new Date(now.getTime() - 4 * 60 * 1000),
  },
  {
    id: 'demo_assistant_1',
    type: 'assistant',
    content: 'Here are all 3 resources for this session:',
    responseType: 'resource_list',
    resources: DEMO_RESOURCES,
    timestamp: new Date(now.getTime() - 4 * 60 * 1000 + 2000),
  },
  {
    id: 'demo_user_2',
    type: 'user',
    content: 'What is binary search and how does it work?',
    timestamp: new Date(now.getTime() - 3 * 60 * 1000),
  },
  {
    id: 'demo_assistant_2',
    type: 'assistant',
    content:
      'Binary search is an efficient search algorithm for sorted arrays. It works by repeatedly halving the search space:\n\n1. Compare the target with the middle element\n2. If equal — found!\n3. If target < middle — search the left half\n4. If target > middle — search the right half\n5. Repeat until found or space is empty\n\nTime complexity: **O(log n)** — for 1 million elements, it takes at most 20 comparisons.',
    responseType: 'rag_answer',
    confidence: 0.92,
    searchResults: [
      {
        title: 'Data Structures Cheat Sheet',
        snippet: '...Binary Search: O(log n) average and worst case for sorted arrays...',
        score: 0.92,
        resource_type: 'pdf',
      },
      {
        title: 'Lecture Notes: Complexity Analysis',
        snippet: '...Binary Search Tree: search O(log n) avg, O(n) worst...',
        score: 0.85,
        resource_type: 'note',
      },
    ],
    timestamp: new Date(now.getTime() - 3 * 60 * 1000 + 3000),
  },
];

// ── Demo AI Assistant (v2) Data ──────────────────────────────────

export const DEMO_AI_CONVERSATIONS = [
  {
    id: 'demo-conv-1',
    session_id: DEMO_SESSION_ID,
    title: 'Binary search and complexity',
    created_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    updated_at: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-conv-2',
    session_id: DEMO_SESSION_ID,
    title: 'Stack vs Queue differences',
    created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(now.getTime() - 1.5 * 60 * 60 * 1000).toISOString(),
  },
];

export const DEMO_AI_MESSAGES = {
  'demo-conv-1': [
    {
      id: 'msg-1a',
      conversation_id: 'demo-conv-1',
      role: 'user',
      content: 'What is binary search and how does it work?',
      message_type: 'text',
      metadata: null,
      created_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    },
    {
      id: 'msg-1b',
      conversation_id: 'demo-conv-1',
      role: 'assistant',
      content: 'Binary search is an efficient search algorithm for sorted arrays. It works by repeatedly halving the search space:\n\n1. Compare the target with the middle element\n2. If equal — found!\n3. If target < middle — search the left half\n4. If target > middle — search the right half\n5. Repeat until found or space is empty\n\nTime complexity: **O(log n)** — for 1 million elements, it takes at most 20 comparisons.',
      message_type: 'text',
      metadata: {
        sources: [
          { resourceTitle: 'Data Structures Cheat Sheet', resourceType: 'pdf', snippet: 'Binary Search: O(log n) average and worst case for sorted arrays', similarityScore: 0.92, pageNumber: 3 },
          { resourceTitle: 'Lecture Notes: Complexity Analysis', resourceType: 'note', snippet: 'Binary Search Tree: search O(log n) avg, O(n) worst', similarityScore: 0.85 },
        ],
        confidence: { score: 0.89, label: 'high' },
        suggestedFollowups: ['What happens if the array is not sorted?', 'How does binary search compare to linear search?', 'Can binary search work on linked lists?'],
      },
      created_at: new Date(now.getTime() - 30 * 60 * 1000 + 3000).toISOString(),
    },
  ],
  'demo-conv-2': [
    {
      id: 'msg-2a',
      conversation_id: 'demo-conv-2',
      role: 'user',
      content: 'What is the difference between a stack and a queue?',
      message_type: 'text',
      metadata: null,
      created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'msg-2b',
      conversation_id: 'demo-conv-2',
      role: 'assistant',
      content: 'A **Stack** follows LIFO (Last In, First Out) — the last element pushed is the first to be popped. Think of a stack of plates.\n\nA **Queue** follows FIFO (First In, First Out) — the first element enqueued is the first to be dequeued. Think of a line at a ticket counter.\n\n**Key operations:**\n- Stack: push O(1), pop O(1), peek O(1)\n- Queue: enqueue O(1), dequeue O(1), front O(1)\n\n**Use cases:**\n- Stack: undo/redo, function call tracking, backtracking, expression parsing\n- Queue: BFS, CPU scheduling, print spoolers, message queues',
      message_type: 'text',
      metadata: {
        sources: [
          { resourceTitle: 'Data Structures Cheat Sheet', resourceType: 'pdf', snippet: 'Stack: push O(1), pop O(1). Queue: enqueue O(1), dequeue O(1)', similarityScore: 0.88, pageNumber: 1 },
        ],
        confidence: { score: 0.88, label: 'high' },
        suggestedFollowups: ['When should I use a deque?', 'How is a stack implemented using arrays vs linked lists?'],
      },
      created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000 + 4000).toISOString(),
    },
  ],
};

export const DEMO_AI_DOUBTS = [
  {
    id: 'doubt-1',
    message_id: 'msg-ext-1',
    session_id: DEMO_SESSION_ID,
    student_id: '112345',
    student_name: 'Arun Krishnan',
    student_email: '112345@sastra.ac.in',
    doubt_text: 'I still don\'t understand why BFS guarantees shortest path but DFS does not',
    ai_messages: { content: 'BFS explores all neighbours level by level so the first time it reaches the destination it\'s guaranteed to be via the fewest edges. DFS can go deep down a long path before exploring a short one.' },
    status: 'unresolved',
    created_at: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
  },
  {
    id: 'doubt-2',
    message_id: 'msg-ext-2',
    session_id: DEMO_SESSION_ID,
    student_id: '112347',
    student_name: 'Karthik Rajan',
    student_email: '112347@sastra.ac.in',
    doubt_text: 'The explanation of amortized analysis for dynamic arrays was confusing',
    ai_messages: { content: 'Amortized analysis considers the average cost per operation over a sequence of operations. For dynamic arrays, most insertions are O(1) but occasional resizing is O(n)...' },
    status: 'unresolved',
    created_at: new Date(now.getTime() - 20 * 60 * 1000).toISOString(),
  },
];

export const DEMO_STUDY_SUMMARY = {
  summary: {
    total_queries: 24,
    topics_explored: ['binary search', 'stack', 'queue', 'Big-O notation', 'BFS', 'DFS', 'linked list'],
    last_query_at: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
    study_duration_minutes: 45,
  },
};

export const DEMO_QUIZ_RESPONSE = {
  questions: [
    {
      question: 'What is the time complexity of binary search on a sorted array?',
      options: ['A) O(n)', 'B) O(n²)', 'C) O(log n)', 'D) O(1)'],
      correctAnswer: 'C',
      justification: 'Binary search halves the search space at each step, giving O(log n) time complexity.',
      difficulty: 'easy',
    },
    {
      question: 'Which data structure is used to implement BFS?',
      options: ['A) Stack', 'B) Queue', 'C) Heap', 'D) Hash Map'],
      correctAnswer: 'B',
      justification: 'BFS uses a queue to process nodes level by level, ensuring shortest-path discovery.',
      difficulty: 'easy',
    },
    {
      question: 'What is the worst-case time complexity of inserting into an AVL tree?',
      options: ['A) O(1)', 'B) O(n)', 'C) O(log n)', 'D) O(n log n)'],
      correctAnswer: 'C',
      justification: 'AVL trees maintain balance through rotations, keeping height O(log n), so insertion is O(log n) even in the worst case.',
      difficulty: 'medium',
    },
    {
      question: 'Which sorting algorithm has the best worst-case time complexity?',
      options: ['A) Quick Sort', 'B) Merge Sort', 'C) Bubble Sort', 'D) Selection Sort'],
      correctAnswer: 'B',
      justification: 'Merge Sort guarantees O(n log n) in all cases. Quick Sort degrades to O(n²) in the worst case.',
      difficulty: 'medium',
    },
    {
      question: 'In a max-heap with n elements, where is the minimum element located?',
      options: ['A) Root node', 'B) Any internal node', 'C) Among the leaf nodes', 'D) Second level'],
      correctAnswer: 'C',
      justification: 'In a max-heap, every parent is greater than its children. The minimum must be a leaf node since it cannot be a parent of any smaller element.',
      difficulty: 'hard',
    },
  ],
};

// Simulated SSE streaming response for demo mode chat
const DEMO_STREAM_RESPONSES = {
  default: {
    text: 'This is a demo environment. In the live platform, this would return an AI-generated answer from your course materials using Retrieval-Augmented Generation (RAG). The AI assistant uses Mistral Large to generate high-quality, contextual answers based on your uploaded lecture materials.',
    sources: [
      { resourceTitle: 'Data Structures Cheat Sheet', resourceType: 'pdf', snippet: '...relevant excerpt from your materials...', similarityScore: 0.88, pageNumber: 2 },
    ],
    confidence: { score: 0.88, label: 'high' },
    followups: ['What topics are covered in the course?', 'Can you summarize the resources?', 'Generate a quiz on this topic'],
  },
  list: {
    text: 'Here are all the resources available for this session:',
    resources: DEMO_RESOURCES,
    resourceCount: DEMO_RESOURCES.length,
    followups: ['Summarize the first resource', 'What topics do these cover?'],
  },
  explain: {
    text: '**Definition:** A stack is a linear data structure that follows the Last In, First Out (LIFO) principle.\n\n**How it works:** Elements are added (pushed) and removed (popped) from the same end, called the "top" of the stack. Only the top element is accessible at any time.\n\n**Example:** Think of a stack of plates in a cafeteria — you always take the plate from the top, and new plates are added on top.\n\n**Analogy:** Imagine an undo feature in a text editor. Each action is "pushed" onto a stack. When you press Ctrl+Z, the most recent action is "popped" off and reversed.\n\n**Practice Question:** If you push elements 1, 2, 3, 4 onto a stack and then pop twice, what element is at the top?',
    sources: [
      { resourceTitle: 'Data Structures Cheat Sheet', resourceType: 'pdf', snippet: 'Stack: push O(1), pop O(1), peek O(1). LIFO ordering.', similarityScore: 0.91, pageNumber: 1 },
    ],
    confidence: { score: 0.91, label: 'high' },
    followups: ['What are common applications of stacks?', 'How is a stack different from a queue?', 'Explain recursion using stacks'],
  },
  quiz: {
    text: 'Here\'s a quiz based on your course materials:',
    questions: DEMO_QUIZ_RESPONSE.questions.slice(0, 3),
    followups: ['Generate a harder quiz', 'Explain the answers in detail'],
  },
  summarize: {
    text: '**Overview:** This session covers fundamental data structures and algorithm analysis techniques.\n\n**Key Points:**\n- Big-O notation and complexity classes (O(1), O(log n), O(n), O(n²))\n- Linear structures: Arrays, Linked Lists, Stacks, Queues\n- Tree structures: BST, AVL, Heaps\n- Graph algorithms: BFS, DFS, shortest paths\n- Sorting algorithms and their complexity trade-offs\n\n**Detailed Summary:** The materials provide a comprehensive foundation in data structures, starting with complexity analysis and progressing through linear and non-linear structures. Special emphasis is placed on understanding when to use each structure based on time/space trade-offs.',
    sources: [
      { resourceTitle: 'Data Structures Cheat Sheet', resourceType: 'pdf', snippet: 'Covers Big-O notation, stack/queue operations, BST traversal', similarityScore: 0.85, pageNumber: 1 },
      { resourceTitle: 'Lecture Notes: Complexity Analysis', resourceType: 'note', snippet: 'Summary of time complexities for all major data structures', similarityScore: 0.82 },
    ],
    confidence: { score: 0.84, label: 'high' },
    followups: ['What are the most important topics for the exam?', 'Explain Big-O notation in detail', 'Generate a quiz on sorting algorithms'],
  },
};

/**
 * Simulate SSE streaming for demo mode.
 * Called by useAIChat.sendMessage when in demo mode.
 * Calls the same state setters the real SSE parser would.
 */
export const simulateDemoStream = async (query, mode, callbacks) => {
  const { onStatus, onToken, onSources, onSuggestions, onResources, onQuiz, onDone } = callbacks;
  const lowerQuery = (query || '').toLowerCase();

  // Pick response based on query/mode
  let response;
  if (lowerQuery.includes('list') || lowerQuery.includes('resource')) {
    response = DEMO_STREAM_RESPONSES.list;
  } else if (mode === 'explain' || lowerQuery.includes('explain') || lowerQuery.includes('what is')) {
    response = DEMO_STREAM_RESPONSES.explain;
  } else if (mode === 'quiz' || lowerQuery.includes('quiz') || lowerQuery.includes('test me')) {
    response = DEMO_STREAM_RESPONSES.quiz;
  } else if (mode === 'summary' || lowerQuery.includes('summar')) {
    response = DEMO_STREAM_RESPONSES.summarize;
  } else {
    response = DEMO_STREAM_RESPONSES.default;
  }

  // Simulate classification delay
  onStatus('classifying');
  await _delay(400);

  // Simulate retrieval
  onStatus('retrieving');
  await _delay(600);

  // Simulate token streaming
  onStatus('generating');
  const words = response.text.split(' ');
  let streamed = '';
  for (const word of words) {
    streamed += (streamed ? ' ' : '') + word;
    onToken(streamed);
    await _delay(30 + Math.random() * 20);
  }

  // Send metadata events
  if (response.sources) onSources(response.sources, response.confidence);
  if (response.followups) onSuggestions(response.followups);
  if (response.resources) onResources(response.resources, response.resourceCount);
  if (response.questions) onQuiz(response.questions);

  await _delay(100);
  onDone(`demo-msg-${Date.now()}`, 'demo-conv-1');
};

const _delay = (ms) => new Promise(r => setTimeout(r, ms));

// ── Demo Community Data ───────────────────────────────────────────

const _ago = (mins) => new Date(Date.now() - mins * 60 * 1000).toISOString();

export const DEMO_COMMUNITY_SESSION_TICKETS = [
  {
    id: 2001, session_id: 1, subject: null,
    title: 'When should I use a Stack vs a Queue?',
    content: "I understand both are linear data structures, but I'm confused about which one to pick in real problems. Can someone give practical examples?",
    status: 'open', upvote_count: 12, has_upvoted: false, reply_count: 3,
    author_id: '126156078', author_name: 'Arjun Mehta', author_role: 'student',
    created_at: _ago(45), updated_at: _ago(45),
  },
  {
    id: 2002, session_id: 1, subject: null,
    title: 'Why is Merge Sort preferred over Quick Sort for linked lists?',
    content: "Sir mentioned this in class but I didn't fully get the reason. Is it because of random access?",
    status: 'resolved', upvote_count: 8, has_upvoted: true, reply_count: 4,
    author_id: '127005045', author_name: 'Priya Nair', author_role: 'student',
    created_at: _ago(90), updated_at: _ago(60),
  },
  {
    id: 2003, session_id: 1, subject: null,
    title: 'Difference between BFS and DFS — which is better for shortest path?',
    content: "Both traverse graphs, but when I tried DFS for shortest path it gave wrong answers. Why?",
    status: 'open', upvote_count: 6, has_upvoted: false, reply_count: 2,
    author_id: '127018011', author_name: 'Kiran Reddy', author_role: 'student',
    created_at: _ago(20), updated_at: _ago(20),
  },
];

export const DEMO_COMMUNITY_GLOBAL_TICKETS = [
  {
    id: 3001, session_id: null, subject: 'DBMS',
    title: "What is the difference between 2NF and 3NF in database normalisation?",
    content: "I keep getting confused between partial dependency (2NF) and transitive dependency (3NF). Can someone explain with a simple example?",
    status: 'open', upvote_count: 34, has_upvoted: false, reply_count: 7,
    author_id: '126156008', author_name: 'Sneha Iyer', author_role: 'student',
    created_at: _ago(200), updated_at: _ago(200),
  },
  {
    id: 3002, session_id: null, subject: 'OS',
    title: 'Difference between process and thread — why are threads "lighter"?',
    content: "Everyone says threads are lightweight but I want to understand specifically what resources are shared vs not shared when you create a thread.",
    status: 'open', upvote_count: 27, has_upvoted: true, reply_count: 5,
    author_id: '127005045', author_name: 'Priya Nair', author_role: 'student',
    created_at: _ago(300), updated_at: _ago(300),
  },
  {
    id: 3003, session_id: null, subject: 'Networks',
    title: 'TCP 3-way handshake — why exactly 3 steps and not 2?',
    content: "Why can't the connection be established in 2 messages? What does the third ACK achieve that SYN+SYN-ACK doesn't?",
    status: 'resolved', upvote_count: 19, has_upvoted: false, reply_count: 6,
    author_id: '127018011', author_name: 'Kiran Reddy', author_role: 'student',
    created_at: _ago(500), updated_at: _ago(420),
  },
  {
    id: 3004, session_id: null, subject: 'Algorithms',
    title: "How does Dijkstra's algorithm handle negative edge weights?",
    content: "I read that Dijkstra fails with negative weights. Why exactly? And what should I use instead?",
    status: 'open', upvote_count: 15, has_upvoted: false, reply_count: 3,
    author_id: '126156078', author_name: 'Arjun Mehta', author_role: 'student',
    created_at: _ago(150), updated_at: _ago(150),
  },
  {
    id: 3005, session_id: null, subject: 'OOP',
    title: "Real-world example where you'd choose composition over inheritance?",
    content: '"Favour composition over inheritance" — can someone show a concrete scenario where inheritance causes problems and composition solves it?',
    status: 'open', upvote_count: 11, has_upvoted: false, reply_count: 4,
    author_id: '126156008', author_name: 'Sneha Iyer', author_role: 'student',
    created_at: _ago(80), updated_at: _ago(80),
  },
];

const DEMO_COMMUNITY_REPLIES = {
  2001: [
    {
      id: 5001, ticket_id: 2001, author_id: 'teacher-1',
      author_name: 'Dr. Rajesh Kumar', author_role: 'teacher',
      content: "Use a Stack when you need LIFO access — undo/redo, function calls, backtracking. Use a Queue when arrival order matters — BFS, CPU scheduling, print spoolers. Rule of thumb: Stack = \"most recent first\", Queue = \"first come, first served\".",
      is_solution: true, created_at: _ago(40),
    },
    {
      id: 5002, ticket_id: 2001, author_id: '127018011',
      author_name: 'Kiran Reddy', author_role: 'student',
      content: "Browser Back button = Stack. Call centre waiting line = Queue. Helped me remember it instantly!",
      is_solution: false, created_at: _ago(35),
    },
    {
      id: 5003, ticket_id: 2001, author_id: '126156008',
      author_name: 'Sneha Iyer', author_role: 'student',
      content: "Also worth noting: Deque (double-ended queue) lets you do both LIFO and FIFO — super useful in sliding window problems.",
      is_solution: false, created_at: _ago(30),
    },
  ],
  2002: [
    {
      id: 5010, ticket_id: 2002, author_id: 'teacher-1',
      author_name: 'Dr. Rajesh Kumar', author_role: 'teacher',
      content: "Arrays support O(1) random access so Quick Sort's partitioning is efficient. Linked lists require traversal to find the midpoint making the partition O(n) per level. Merge Sort only needs sequential access to merge two lists — which linked lists handle perfectly — giving O(n log n) with no extra overhead.",
      is_solution: true, created_at: _ago(80),
    },
    {
      id: 5011, ticket_id: 2002, author_id: '126156078',
      author_name: 'Arjun Mehta', author_role: 'student',
      content: "Also Merge Sort is stable — preserves relative order of equal elements — sometimes a requirement.",
      is_solution: false, created_at: _ago(70),
    },
  ],
  2003: [
    {
      id: 5020, ticket_id: 2003, author_id: '127005045',
      author_name: 'Priya Nair', author_role: 'student',
      content: "DFS doesn't guarantee the shortest path because it can go deep down a long path before exploring a short one. BFS explores all neighbours level by level so the first time it reaches the destination it's guaranteed to be via the fewest edges.",
      is_solution: false, created_at: _ago(15),
    },
    {
      id: 5021, ticket_id: 2003, author_id: '126156008',
      author_name: 'Sneha Iyer', author_role: 'student',
      content: "For weighted graphs with different edge costs, use Dijkstra's instead of BFS.",
      is_solution: false, created_at: _ago(10),
    },
  ],
  3001: [
    {
      id: 6001, ticket_id: 3001, author_id: 'teacher-1',
      author_name: 'Dr. Rajesh Kumar', author_role: 'teacher',
      content: "2NF removes partial dependencies — every non-key attribute must depend on the entire composite primary key. 3NF removes transitive dependencies — no non-key attribute should depend on another non-key attribute.\n\nExample: Orders(OrderID, ProductID, ProductName, CustomerCity). ProductName depends only on ProductID → partial dep, violates 2NF. CustomerCountry derived from CustomerCity → transitive dep, violates 3NF.",
      is_solution: true, created_at: _ago(190),
    },
    {
      id: 6002, ticket_id: 3001, author_id: '127005045',
      author_name: 'Priya Nair', author_role: 'student',
      content: "Mnemonic: 2NF = 'the whole key', 3NF = 'nothing but the key'. Saves me every exam!",
      is_solution: false, created_at: _ago(185),
    },
  ],
  3002: [
    {
      id: 6010, ticket_id: 3002, author_id: 'teacher-1',
      author_name: 'Dr. Rajesh Kumar', author_role: 'teacher',
      content: "Threads within the same process share: code segment, data segment, heap, open files, and signals. Each thread gets its own: stack, registers, and program counter. Creating a new process duplicates all of this — hence threads are 'lighter'. Context switching between threads is faster because the memory space stays the same.",
      is_solution: true, created_at: _ago(290),
    },
  ],
  3003: [
    {
      id: 6020, ticket_id: 3003, author_id: '127005045',
      author_name: 'Priya Nair', author_role: 'student',
      content: "With SYN+SYN-ACK only, the server confirms it heard the client but the client's final ACK confirms the server's sequence number is acknowledged. Without it, the server can't be sure the client received its SYN-ACK — so the server's ISN is unverified. The third step completes bidirectional synchronisation.",
      is_solution: true, created_at: _ago(450),
    },
    {
      id: 6021, ticket_id: 3003, author_id: '126156078',
      author_name: 'Arjun Mehta', author_role: 'student',
      content: 'Think of it like: "Can you hear me?" — "Yes, can YOU hear me?" — "Yes!". Both sides must confirm both directions.',
      is_solution: false, created_at: _ago(440),
    },
  ],
  3004: [
    {
      id: 6030, ticket_id: 3004, author_id: '126156008',
      author_name: 'Sneha Iyer', author_role: 'student',
      content: "Dijkstra greedily picks the minimum-cost unvisited node. With a negative edge, a previously 'settled' node might actually be reachable for less cost via that edge — but Dijkstra never revisits settled nodes so it misses it. Use Bellman-Ford instead — it relaxes all edges V-1 times so negative edges are handled correctly (though it's O(VE) vs Dijkstra's O(E log V)).",
      is_solution: false, created_at: _ago(140),
    },
  ],
};

// ── Demo Analytics Data ───────────────────────────────────────────

const _daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString().split('T')[0];

export const DEMO_ANALYTICS = {
  overview: {
    totalSessions: 4,
    totalPolls: 41,
    totalStudents: 435,
    avgResponseRate: 78,
    avgCorrectRate: 67,
  },

  engagementTrends: (() => {
    // 30 days of synthetic data — peaks on lecture days (Mon/Wed/Fri)
    const base = [
      [0,0,0],[1,18,3],[2,0,0],[3,22,4],[4,0,0],[5,31,5],[6,0,0],
      [7,0,0],[8,25,4],[9,0,0],[10,29,5],[11,0,0],[12,38,6],[13,0,0],
      [14,0,0],[15,21,3],[16,0,0],[17,34,6],[18,0,0],[19,42,7],[20,0,0],
      [21,0,0],[22,27,4],[23,0,0],[24,36,6],[25,0,0],[26,45,8],[27,0,0],
      [28,0,0],[29,19,3],
    ];
    return base.map(([offset, responses, polls]) => ({
      date: _daysAgo(29 - offset),
      responsesReceived: responses,
      pollsCreated: polls,
      avgAccuracy: responses > 0 ? Math.round(55 + Math.random() * 30) : 0,
    }));
  })(),

  pollPerformance: [
    { pollId: 101, question: 'Which data structure uses LIFO order?', sessionTitle: 'Data Structures & Algorithms', totalResponses: 112, correctResponses: 97, accuracyRate: 87, avgResponseTimeSec: 4.2 },
    { pollId: 102, question: 'Time complexity of binary search?', sessionTitle: 'Data Structures & Algorithms', totalResponses: 108, correctResponses: 79, accuracyRate: 73, avgResponseTimeSec: 5.8 },
    { pollId: 103, question: 'What is the output of a min-heap root?', sessionTitle: 'Data Structures & Algorithms', totalResponses: 99, correctResponses: 61, accuracyRate: 62, avgResponseTimeSec: 7.1 },
    { pollId: 104, question: 'Which scheduling algorithm causes convoy effect?', sessionTitle: 'Operating Systems', totalResponses: 78, correctResponses: 42, accuracyRate: 54, avgResponseTimeSec: 8.3 },
    { pollId: 105, question: 'What does a semaphore solve?', sessionTitle: 'Operating Systems', totalResponses: 82, correctResponses: 55, accuracyRate: 67, avgResponseTimeSec: 6.5 },
    { pollId: 106, question: 'What is thrashing in virtual memory?', sessionTitle: 'Operating Systems', totalResponses: 76, correctResponses: 38, accuracyRate: 50, avgResponseTimeSec: 9.0 },
    { pollId: 107, question: 'Which normal form eliminates partial dependencies?', sessionTitle: 'Database Management Systems', totalResponses: 131, correctResponses: 102, accuracyRate: 78, avgResponseTimeSec: 5.3 },
    { pollId: 108, question: 'What does ACID stand for?', sessionTitle: 'Database Management Systems', totalResponses: 128, correctResponses: 119, accuracyRate: 93, avgResponseTimeSec: 3.9 },
    { pollId: 109, question: 'TCP vs UDP — which is connection-oriented?', sessionTitle: 'Computer Networks', totalResponses: 69, correctResponses: 64, accuracyRate: 93, avgResponseTimeSec: 3.2 },
    { pollId: 110, question: 'What layer does IP operate at?', sessionTitle: 'Computer Networks', totalResponses: 67, correctResponses: 48, accuracyRate: 72, avgResponseTimeSec: 5.7 },
  ],

  sessionAnalytics: [
    { id: 1, title: 'Data Structures & Algorithms', courseName: 'CS201', sessionId: 'DEMO01', isActive: true,  pollCount: 12, participantCount: 127, avgAccuracy: 72 },
    { id: 2, title: 'Operating Systems',             courseName: 'CS301', sessionId: 'DEMO02', isActive: true,  pollCount: 8,  participantCount: 89,  avgAccuracy: 58 },
    { id: 3, title: 'Database Management Systems',   courseName: 'CS302', sessionId: 'DEMO03', isActive: false, pollCount: 15, participantCount: 143, avgAccuracy: 81 },
    { id: 4, title: 'Computer Networks',             courseName: 'CS401', sessionId: 'DEMO04', isActive: false, pollCount: 6,  participantCount: 76,  avgAccuracy: 75 },
  ],
};

// ── Demo Teacher Data ─────────────────────────────────────────────

export const DEMO_TEACHER = {
  id: 'demo-teacher-9999',
  email: 'demo.teacher@sastra.edu',
  fullName: 'Dr. Rajesh Kumar',
  full_name: 'Dr. Rajesh Kumar',
  role: 'teacher',
};

export const DEMO_TEACHER_SESSIONS = [
  {
    id: 1,
    session_id: 'DEMO01',
    title: 'Data Structures & Algorithms',
    course_name: 'CS201',
    description: 'Introduction to fundamental data structures and algorithm analysis techniques.',
    is_active: true,
    is_live: true,
    participant_count: 127,
    poll_count: 12,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 2,
    session_id: 'DEMO02',
    title: 'Operating Systems',
    course_name: 'CS301',
    description: 'Processes, memory management, scheduling, and file systems.',
    is_active: true,
    is_live: false,
    participant_count: 89,
    poll_count: 8,
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 3,
    session_id: 'DEMO03',
    title: 'Database Management Systems',
    course_name: 'CS302',
    description: 'Relational models, SQL, normalisation, transactions, and indexing.',
    is_active: false,
    is_live: false,
    participant_count: 143,
    poll_count: 15,
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 4,
    session_id: 'DEMO04',
    title: 'Computer Networks',
    course_name: 'CS401',
    description: 'OSI model, TCP/IP, routing, transport layer protocols, and network security.',
    is_active: false,
    is_live: false,
    participant_count: 76,
    poll_count: 6,
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// ── localStorage helpers ──────────────────────────────────────────

export const isDemoMode = () => localStorage.getItem('isDemo') === 'true';

export const enterDemoMode = () => {
  localStorage.setItem('authToken', 'demo-token');
  localStorage.setItem('currentUser', JSON.stringify(DEMO_USER));
  localStorage.setItem('isDemo', 'true');
  // Pre-seed AI chat history so the assistant loads with sample conversation
  localStorage.setItem(`chat_history_${DEMO_SESSION_ID}`, JSON.stringify(DEMO_AI_CHAT));
};

export const enterTeacherDemoMode = () => {
  localStorage.setItem('authToken', 'demo-token');
  localStorage.setItem('currentUser', JSON.stringify(DEMO_TEACHER));
  localStorage.setItem('isDemo', 'true');
};

export const exitDemoMode = () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  localStorage.removeItem('isDemo');
  localStorage.removeItem(`chat_history_${DEMO_SESSION_ID}`);
};

// ── API mock handler ──────────────────────────────────────────────

export const handleDemoRequest = (endpoint, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  const ep = endpoint.toUpperCase();

  // Teacher sessions list
  if (ep.includes('/SESSIONS/TEACHER/')) return Promise.resolve(DEMO_TEACHER_SESSIONS);

  // Analytics
  if (ep.includes('/ANALYTICS/TEACHER/')) {
    if (ep.includes('/OVERVIEW'))           return Promise.resolve({ success: true, data: DEMO_ANALYTICS.overview });
    if (ep.includes('/POLL-PERFORMANCE'))   return Promise.resolve({ success: true, data: DEMO_ANALYTICS.pollPerformance });
    if (ep.includes('/ENGAGEMENT-TRENDS')) return Promise.resolve({ success: true, data: DEMO_ANALYTICS.engagementTrends });
    if (ep.includes('/SESSIONS'))           return Promise.resolve({ success: true, data: DEMO_ANALYTICS.sessionAnalytics });
    return Promise.resolve({ success: true, data: [] });
  }

  // Dashboard summary
  if (ep.includes('/STUDENTS/9999/DASHBOARD-SUMMARY')) return Promise.resolve(DEMO_DASHBOARD);

  // Session detail — return both flat and nested (.data) so all consumers work
  if (ep === `/SESSIONS/${DEMO_SESSION_ID}` && method === 'GET')
    return Promise.resolve({ ...DEMO_SESSION, data: DEMO_SESSION });

  // Session polls history
  if (ep === `/SESSIONS/${DEMO_SESSION_ID}/POLLS` && method === 'GET')
    return Promise.resolve({ polls: DEMO_POLLS });

  // Session join / leave / activity / connection
  if (ep.startsWith(`/SESSIONS/${DEMO_SESSION_ID}`) && method === 'POST')
    return Promise.resolve({ success: true });

  // Participants
  if (ep.includes(`/SESSIONS/${DEMO_SESSION_ID}/PARTICIPANTS`)) return Promise.resolve(DEMO_PARTICIPANTS);

  // Active poll — return 404-style so WS handles it
  if (ep.includes(`/SESSIONS/${DEMO_SESSION_ID}/ACTIVE-POLL`)) {
    return Promise.reject(new Error('HTTP error! status: 404'));
  }

  // Poll response for poll 1
  if (ep.includes(`/STUDENTS/9999/POLLS/1001/RESPOND`)) {
    const body = options.body ? JSON.parse(options.body) : {};
    const isCorrect = body.selected_option === DEMO_POLLS[0].correct_answer;
    return Promise.resolve({ id: 1, poll_id: 1001, student_id: 9999, selected_option: body.selected_option, is_correct: isCorrect, points_earned: isCorrect ? 10 : 0, response_time: body.response_time });
  }

  // Poll response for poll 2
  if (ep.includes(`/STUDENTS/9999/POLLS/1002/RESPOND`)) {
    const body = options.body ? JSON.parse(options.body) : {};
    const isCorrect = body.selected_option === DEMO_POLLS[1].correct_answer;
    return Promise.resolve({ id: 2, poll_id: 1002, student_id: 9999, selected_option: body.selected_option, is_correct: isCorrect, points_earned: isCorrect ? 10 : 0, response_time: body.response_time });
  }

  // Resources for session (both endpoint variants)
  if (ep.includes(`/RESOURCES/SESSION/${DEMO_SESSION_ID}`) || ep.includes(`/SESSIONS/${DEMO_SESSION_ID}/RESOURCES`)) {
    return Promise.resolve({ resources: DEMO_RESOURCES });
  }

  // Resource tracking — silent success
  if (ep.includes('/RESOURCES/') && ep.includes('/TRACK')) return Promise.resolve({ success: true });

  // Gamification — stats
  if (ep.includes('/GAMIFICATION/STUDENT/9999/STATS') || ep.includes('/GAMIFICATION/STUDENT/STATS'))
    return Promise.resolve({ success: true, data: { ...DEMO_GAMIFICATION, ...DEMO_GAMIFICATION_XP } });

  // Gamification — XP endpoint
  if (ep.includes('/GAMIFICATION/STUDENT/9999/XP') || ep.match(/\/GAMIFICATION\/STUDENT\/\d+\/XP/))
    return Promise.resolve({ success: true, data: DEMO_GAMIFICATION_XP });

  // Gamification — session summary
  if (ep.includes('/GAMIFICATION/SESSION/') && ep.includes('/SUMMARY'))
    return Promise.resolve({ success: true, data: DEMO_SESSION_SUMMARY });

  // Gamification — teacher session recap
  if (ep.includes('/GAMIFICATION/TEACHER/SESSION/') && ep.includes('/RECAP'))
    return Promise.resolve({
      success: true,
      data: {
        classStats: { avgAccuracy: 72, participationRate: 85, totalStudents: 12, activeStudents: 10 },
        topStudents: DEMO_SESSION_LEADERBOARD.slice(0, 5),
        needsAttention: [
          { studentId: 1005, studentName: 'Vijay Anand', avgAccuracy: 33, pollsAnswered: 3 },
          { studentId: 1006, studentName: 'Sowmya Nair', avgAccuracy: 40, pollsAnswered: 2 },
        ],
      },
    });

  // Gamification — session leaderboard
  if (ep.includes('/GAMIFICATION/LEADERBOARD/SESSION/'))
    return Promise.resolve({ success: true, data: DEMO_SESSION_LEADERBOARD });

  // Gamification — all-time leaderboard
  if (ep.includes('/GAMIFICATION/LEADERBOARD/ALL-TIME'))
    return Promise.resolve({ success: true, data: DEMO_LEADERBOARD });

  // Gamification — finalize session
  if (ep.includes('/GAMIFICATION/SESSION/') && ep.includes('/FINALIZE') && method === 'POST')
    return Promise.resolve({ success: true });

  // Gamification — generic fallback
  if (ep.includes('/GAMIFICATION/')) return Promise.resolve({ success: true, data: DEMO_GAMIFICATION });

  // AI Assistant v2
  if (ep.includes('/AI-ASSISTANT/')) {
    // GET /ai-assistant/session/:sessionId/conversations
    if (ep.includes('/CONVERSATIONS') && !ep.includes('/MESSAGES') && method === 'GET') {
      return Promise.resolve({ conversations: DEMO_AI_CONVERSATIONS });
    }
    // GET /ai-assistant/conversations/:id/messages
    if (ep.includes('/MESSAGES') && method === 'GET') {
      const convMatch = ep.match(/\/CONVERSATIONS\/([^/]+)\/MESSAGES/);
      const convId = convMatch ? convMatch[1].toLowerCase() : null;
      const messages = DEMO_AI_MESSAGES[convId] || DEMO_AI_MESSAGES['demo-conv-1'] || [];
      return Promise.resolve({ messages });
    }
    // DELETE /ai-assistant/conversations/:id
    if (ep.includes('/CONVERSATIONS/') && method === 'DELETE') {
      return Promise.resolve({ success: true });
    }
    // POST /ai-assistant/messages/:id/doubt
    if (ep.includes('/DOUBT') && method === 'POST') {
      return Promise.resolve({ success: true, doubt: { id: `doubt-demo-${Date.now()}`, status: 'unresolved' } });
    }
    // GET /ai-assistant/session/:sessionId/doubts (teacher)
    if (ep.includes('/DOUBTS') && method === 'GET') {
      return Promise.resolve({ doubts: DEMO_AI_DOUBTS });
    }
    // POST /ai-assistant/doubts/:id/resolve (teacher)
    if (ep.includes('/DOUBTS/') && ep.includes('/RESOLVE') && method === 'POST') {
      return Promise.resolve({ success: true });
    }
    // GET /ai-assistant/session/:sessionId/study-summary
    if (ep.includes('/STUDY-SUMMARY')) {
      return Promise.resolve(DEMO_STUDY_SUMMARY);
    }
    // POST /ai-assistant/session/:sessionId/generate-quiz
    if (ep.includes('/GENERATE-QUIZ') && method === 'POST') {
      return Promise.resolve(DEMO_QUIZ_RESPONSE);
    }
    // Fallback for any other AI assistant endpoint
    return Promise.resolve({ success: true });
  }

  // AI search
  if (ep.includes(`/AI-SEARCH/SESSION/${DEMO_SESSION_ID}`)) {
    const body = options.body ? JSON.parse(options.body) : {};
    const query = (body.query || '').toLowerCase();
    if (query.includes('list') || query.includes('resource')) {
      return Promise.resolve({ type: 'resource_list', count: DEMO_RESOURCES.length, resources: DEMO_RESOURCES });
    }
    return Promise.resolve({
      type: 'rag_answer',
      answer: 'This is a demo environment. In the live platform, this would return an AI-generated answer from your course materials using Retrieval-Augmented Generation (RAG).',
      confidence: 0.88,
      sources: [{ title: 'Data Structures Cheat Sheet', snippet: '...relevant excerpt from your materials...', score: 0.88 }],
    });
  }

  // Community
  if (ep.startsWith('/COMMUNITY')) {
    // GET /community/session/:sessionId
    if (ep.includes('/SESSION/') && method !== 'POST') {
      return Promise.resolve({ tickets: DEMO_COMMUNITY_SESSION_TICKETS });
    }
    // GET /community/global
    if (ep.includes('/GLOBAL')) {
      const subject = new URL('http://x' + endpoint.replace('/api', '')).searchParams.get('subject');
      const list = subject
        ? DEMO_COMMUNITY_GLOBAL_TICKETS.filter(t => t.subject === subject)
        : DEMO_COMMUNITY_GLOBAL_TICKETS;
      return Promise.resolve({ tickets: list });
    }
    // POST /community/tickets/:id/upvote
    if (ep.includes('/UPVOTE')) {
      return Promise.resolve({ action: 'added', upvote_count: 1 });
    }
    // POST /community/tickets/:id/replies
    if (ep.match(/\/TICKETS\/\d+\/REPLIES/) && method === 'POST') {
      const body = options.body ? JSON.parse(options.body) : {};
      return Promise.resolve({
        id: Date.now(), ticket_id: 0, author_id: '9999',
        author_name: 'Demo Student', author_role: 'student',
        content: body.content || '', is_solution: false,
        created_at: new Date().toISOString(),
      });
    }
    // PATCH /community/tickets/:id/resolve or /replies/:id/solution
    if (method === 'PATCH') {
      return Promise.resolve({ success: true });
    }
    // GET /community/tickets/:id — ticket detail + replies
    const ticketMatch = ep.match(/\/TICKETS\/(\d+)$/);
    if (ticketMatch && method !== 'POST') {
      const id = parseInt(ticketMatch[1]);
      const all = [...DEMO_COMMUNITY_SESSION_TICKETS, ...DEMO_COMMUNITY_GLOBAL_TICKETS];
      const ticket = all.find(t => t.id === id) || all[0];
      const replies = DEMO_COMMUNITY_REPLIES[ticket.id] || [];
      return Promise.resolve({ ticket, replies });
    }
    // POST /community/tickets — create new ticket
    if (method === 'POST') {
      const body = options.body ? JSON.parse(options.body) : {};
      return Promise.resolve({
        id: Date.now(), session_id: null, subject: body.subject || null,
        title: body.title || '', content: body.content || '',
        status: 'open', upvote_count: 0, has_upvoted: false, reply_count: 0,
        author_id: '9999', author_name: 'Demo Student', author_role: 'student',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
    }
    return Promise.resolve({ tickets: [], replies: [] });
  }

  // Weak topics
  if (ep.includes('/STUDENTS/') && ep.includes('/WEAK-TOPICS'))
    return Promise.resolve({
      weakTopics: [
        { course: 'CS201', wrongCount: 4, questions: [
          { question: 'What is the time complexity of binary search?', yourAnswer: 'O(n)', correctAnswer: 'O(log n)', sessionTitle: 'Data Structures & Algorithms' },
          { question: 'Which traversal visits root first?', yourAnswer: 'Inorder', correctAnswer: 'Preorder', sessionTitle: 'Trees & Graphs' },
        ]},
        { course: 'CS301', wrongCount: 2, questions: [
          { question: 'What does LIFO stand for?', yourAnswer: 'Last In First Out... wait, no', correctAnswer: 'Last In, First Out', sessionTitle: 'Stack & Queue' },
        ]},
      ],
      totalWrong: 6,
    });

  // Knowledge Cards
  if (ep.includes('/KNOWLEDGE-CARDS')) {
    // GET /knowledge-cards/session/:sessionId
    if (ep.includes('/SESSION/') && method === 'GET')
      return Promise.resolve({ success: true, round: DEMO_KNOWLEDGE_CARDS.round, pairs: DEMO_KNOWLEDGE_CARDS.pairs });

    // POST /knowledge-cards/generate
    if (ep.includes('/GENERATE') && method === 'POST')
      return Promise.resolve({ success: true, pairs: DEMO_KNOWLEDGE_CARDS.pairs });

    // POST /knowledge-cards/rounds/:id/distribute
    if (ep.includes('/DISTRIBUTE') && method === 'POST')
      return Promise.resolve({ success: true, distributed: 5 });

    // PATCH /knowledge-cards/pairs/:id/activate
    if (ep.includes('/ACTIVATE') && method === 'PATCH')
      return Promise.resolve({ success: true });

    // PATCH /knowledge-cards/pairs/:id/reveal
    if (ep.includes('/REVEAL') && method === 'PATCH')
      return Promise.resolve({ success: true });

    // PATCH /knowledge-cards/pairs/:id/complete
    if (ep.includes('/COMPLETE') && method === 'PATCH')
      return Promise.resolve({ success: true, voteSummary: { up: 7, down: 2 } });

    // PATCH /knowledge-cards/pairs/:id — edit pair
    if (ep.match(/\/KNOWLEDGE-CARDS\/PAIRS\/\d+$/) && method === 'PATCH')
      return Promise.resolve({ success: true });

    // DELETE /knowledge-cards/pairs/:id
    if (ep.match(/\/KNOWLEDGE-CARDS\/PAIRS\/\d+$/) && method === 'DELETE')
      return Promise.resolve({ success: true });

    // POST /knowledge-cards/vote
    if (ep.includes('/VOTE') && method === 'POST')
      return Promise.resolve({ success: true });

    // POST /knowledge-cards/rounds/:id/end
    if (ep.includes('/END') && method === 'POST')
      return Promise.resolve({ success: true });

    return Promise.resolve({ success: true });
  }

  // Fallback
  return Promise.resolve({ success: true, data: [] });
};

// ── Demo WebSocket ────────────────────────────────────────────────
// Mimics the browser WebSocket API. Fires two polls automatically.

export class DemoWebSocket {
  constructor(_url) {
    this.readyState = 0; // CONNECTING
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this._timers = [];

    // Simulate connection
    this._schedule(500, () => {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen({});

      // Participant count event so "8 online" appears quickly
      this._schedule(1500, () => {
        this._emit({ type: 'participant-count-updated', count: 8, sessionId: DEMO_SESSION_ID });
      });

      // ── Poll 1 fires at 5s ──
      this._schedule(5000, () => {
        const now = Date.now();
        this._emit({
          type: 'poll-activated',
          poll: DEMO_POLLS[0],
          poll_end_time: now + DEMO_POLLS[0].time_limit * 1000,
          server_time: now,
          sessionId: DEMO_SESSION_ID,
        });

        // ── reveal-answers for poll 1 at 5+15 = 20s ──
        this._schedule(DEMO_POLLS[0].time_limit * 1000, () => {
          this._emit({ type: 'reveal-answers', sessionId: DEMO_SESSION_ID, pollId: DEMO_POLLS[0].id });

          // ── Poll 2 fires 5s after poll 1 reveal ──
          this._schedule(5000, () => {
            const now2 = Date.now();
            this._emit({
              type: 'poll-activated',
              poll: DEMO_POLLS[1],
              poll_end_time: now2 + DEMO_POLLS[1].time_limit * 1000,
              server_time: now2,
              sessionId: DEMO_SESSION_ID,
            });

            // ── reveal-answers for poll 2 at 5+15+5+15 = 40s ──
            this._schedule(DEMO_POLLS[1].time_limit * 1000, () => {
              this._emit({ type: 'reveal-answers', sessionId: DEMO_SESSION_ID, pollId: DEMO_POLLS[1].id });

              // ── Knowledge Cards demo — starts 6s after poll 2 reveal ──

              // Step 1: Distribute cards (46s total)
              this._schedule(6000, () => {
                this._emit({
                  type: 'cards-distribute',
                  card: DEMO_KNOWLEDGE_CARDS.studentCard,
                });

                // Step 2: Activate question — it's the demo student's turn! (54s total)
                this._schedule(8000, () => {
                  this._emit({
                    type: 'card-activate-question',
                    pairId: DEMO_KNOWLEDGE_CARDS.activeState.pairId,
                    questionHolderId: DEMO_KNOWLEDGE_CARDS.activeState.questionHolderId,
                  });

                  // Step 3: Reveal answer holder (64s total)
                  this._schedule(10000, () => {
                    this._emit({
                      type: 'card-reveal-answer',
                      pairId: DEMO_KNOWLEDGE_CARDS.activeState.pairId,
                      answerHolderId: DEMO_KNOWLEDGE_CARDS.activeState.answerHolderId,
                      questionHolderId: DEMO_KNOWLEDGE_CARDS.activeState.questionHolderId,
                    });

                    // Step 4: Complete the pair, open voting (72s total)
                    this._schedule(8000, () => {
                      this._emit({
                        type: 'cards-round-complete',
                        voteSummary: { up: 7, down: 2 },
                      });

                      // Step 5: End the activity (82s total)
                      this._schedule(10000, () => {
                        this._emit({ type: 'cards-activity-end' });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  _schedule(ms, fn) {
    const id = setTimeout(fn, ms);
    this._timers.push(id);
    return id;
  }

  _emit(data) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }

  send(_data) {
    // no-op — demo doesn't need to process outgoing messages
  }

  close() {
    this.readyState = 3; // CLOSED
    this._timers.forEach(clearTimeout);
    this._timers = [];
    if (this.onclose) this.onclose({});
  }
}
