// Curriculum for a ~1000-rated player. Every position and answer is checked by tests/content.test.ts
// (legal FEN, legal answers, and answers confirmed as good moves by Stockfish).

export interface Task {
  fen: string;
  prompt: string;
  /** accepted answers (UCI); any move that gives checkmate is also accepted */
  accept: string[];
  explain: string;
  hint: string;
}
export type Step = { kind: 'text'; body: string } | { kind: 'task'; task: Task };
export interface Lesson { id: string; title: string; summary: string; unit: string; steps: Step[]; quiz: Task[]; practice?: string }

const t = (body: string): Step => ({ kind: 'text', body });
const task = (x: Task): Step => ({ kind: 'task', task: x });

export const LESSONS: Lesson[] = [
  {
    id: 'safety', unit: 'Safety first', title: 'Count before you capture', summary: 'Attackers, defenders and why most games at 1000 are decided by loose pieces.',
    practice: 'hangingPiece',
    steps: [
      t('Before every move, ask two questions. Which of my pieces are attacked? Which of my opponent’s pieces are loose? A piece is “loose” (or hanging) when it is attacked and not defended.'),
      t('To see if a capture is safe, count. If a piece is attacked twice and defended once, the attacker wins it. Also check the values: a pawn (1) taking a knight (3) is good even if the knight is defended.'),
      task({ fen: '6k1/5ppp/8/3n4/8/2N2B2/5PPP/6K1 w - - 0 1', prompt: 'The black knight on d5 is attacked twice and defended by nothing. Take it.', accept: ['c3d5', 'f3d5'], explain: 'Nothing defends d5, so the knight is simply won.', hint: 'Which white pieces attack d5?' }),
      t('The same check protects you. After your opponent moves, look at what their piece now attacks. Most blunders at this level come from missing that one question.'),
    ],
    quiz: [
      { fen: 'r3k2r/ppp2ppp/2n5/3q4/8/2N5/PPP2PPP/R2QK2R w KQkq - 0 1', prompt: 'White to move. One black piece is attacked and has no defender.', accept: ['c3d5', 'd1d5'], explain: 'The black queen on d5 is attacked by the knight and the queen, and nothing defends it.', hint: 'Look at what the knight on c3 attacks.' },
      { fen: 'rnbqkb1r/ppp1ppp1/5n1p/3p2B1/3P4/2N5/PPP1PPPP/R2QKBNR w KQkq - 0 4', prompt: 'White to move. Your bishop is attacked by a pawn. Deal with it.', accept: ['g5h4', 'g5f6', 'g5f4'], explain: 'A bishop attacked by a pawn must move or trade. Bh4, Bf4 and Bxf6 all keep the material level.', hint: 'Which white piece is attacked by the h6 pawn?' },
    ],
  },
  {
    id: 'fork', unit: 'Basic tactics', title: 'Forks', summary: 'One piece attacking two at once.', practice: 'fork',
    steps: [
      t('A fork is one piece attacking two (or more) things at once. Your opponent can only save one of them. Knights are the best forkers because their jumps are hard to see.'),
      t('The strongest forks include a check: the king must move, and you take the other piece.'),
      task({ fen: 'r3k3/pp4pp/8/3N4/8/8/PP4PP/4K3 w - - 0 1', prompt: 'Find the knight fork.', accept: ['d5c7'], explain: 'Nc7+ checks the king and attacks the rook on a8 at the same time. After the king moves, Nxa8 wins the rook.', hint: 'Which square attacks both e8 and a8?' }),
    ],
    quiz: [
      { fen: '6k1/5ppp/8/2q1r3/8/8/1N3PPP/6K1 w - - 0 1', prompt: 'White to move. Fork the queen and the rook.', accept: ['b2d3'], explain: 'Nd3 attacks both the queen on c5 and the rook on e5.', hint: 'Look for a knight square that touches c5 and e5.' },
      { fen: '4k3/8/8/2n1b3/8/3PP3/8/4K3 w - - 0 1', prompt: 'White to move. Even a pawn can fork.', accept: ['d3d4'], explain: 'd4 attacks the knight and the bishop. The pawn is defended by e3, so it can’t simply be taken.', hint: 'Which pawn move attacks c5 and e5?' },
    ],
  },
  {
    id: 'pin', unit: 'Basic tactics', title: 'Pins', summary: 'A piece that can’t move without exposing something bigger.', practice: 'pin',
    steps: [
      t('A pin happens when a piece can’t move because a more valuable piece stands behind it on the same line. If the piece behind is the king, the pinned piece is not allowed to move at all.'),
      t('Once a piece is pinned, attack it again, often with a pawn. It can’t run away.'),
      task({ fen: '4k3/8/2n5/1B6/3P4/8/8/4K3 w - - 0 1', prompt: 'The knight on c6 is pinned to the king. Attack it.', accept: ['d4d5'], explain: 'd5 attacks the pinned knight. It can’t move, so White wins it.', hint: 'Which pawn can attack c6?' }),
    ],
    quiz: [
      { fen: '6k1/6pp/8/3q4/8/1P6/5PPP/5BK1 w - - 0 1', prompt: 'White to move. Pin the queen to the king.', accept: ['f1c4'], explain: 'Bc4 pins the queen against the king on g8. Black has to give up the queen for the bishop.', hint: 'Find a bishop square on the line from d5 to g8.' },
      { fen: '4k3/4n3/8/3P4/8/8/8/4RK2 w - - 0 1', prompt: 'White to move. The knight is pinned by the rook. Win it.', accept: ['d5d6'], explain: 'd6 attacks the pinned knight on e7, and it can’t move off the e-file.', hint: 'Attack e7 with a pawn.' },
    ],
  },
  {
    id: 'skewer', unit: 'Basic tactics', title: 'Skewers', summary: 'Attack the big piece; win the one behind it.', practice: 'skewer',
    steps: [
      t('A skewer is a pin in reverse: you attack a valuable piece, it has to move, and the piece behind it is lost.'),
      task({ fen: '8/8/8/2k4r/8/8/8/R5K1 w - - 0 1', prompt: 'Skewer the king and the rook.', accept: ['a1a5'], explain: 'Ra5+ checks the king along the fifth rank. When the king moves, Rxh5 wins the rook.', hint: 'Give a check along the fifth rank.' }),
    ],
    quiz: [
      { fen: 'r3k3/8/8/3q4/8/5P2/8/1B2K3 w - - 0 1', prompt: 'White to move. Skewer the queen and the rook.', accept: ['b1e4'], explain: 'Be4 attacks the queen; behind it on the long diagonal sits the rook on a8. The bishop is protected by the f3 pawn.', hint: 'Which square puts the bishop on the a8–h1 diagonal?' },
    ],
  },
  {
    id: 'discovered', unit: 'Basic tactics', title: 'Discovered attacks', summary: 'Move one piece to unleash another.', practice: 'discoveredAttack',
    steps: [
      t('When a piece moves out of the way, the piece behind it suddenly attacks along the line. If the piece that moves also makes a threat (best of all, a check), your opponent can’t meet both.'),
      task({ fen: '3q2k1/5ppp/8/8/8/3B4/5PPP/3R2K1 w - - 0 1', prompt: 'Move the bishop with check and uncover the rook.', accept: ['d3h7'], explain: 'Bxh7+ is check, so Black must answer it. Meanwhile the rook on d1 now attacks the queen on d8.', hint: 'The bishop blocks the d-file. Where can it go with check?' }),
    ],
    quiz: [
      { fen: '4k3/8/8/q3N3/8/8/4R3/6K1 w - - 0 1', prompt: 'White to move. A discovered check wins the queen.', accept: ['e5c6', 'e5c4'], explain: 'The knight moves off the e-file with check from the rook, and from c6 or c4 it attacks the queen on a5.', hint: 'Move the knight to a square that attacks a5.' },
    ],
  },
  {
    id: 'double', unit: 'Basic tactics', title: 'Double attacks with the queen', summary: 'The queen attacks in eight directions; use them.', practice: 'fork',
    steps: [
      t('The queen is the best piece for double attacks. Look for a check that also hits a loose piece.'),
      task({ fen: '3k4/8/8/7n/8/8/8/Q3K3 w - - 0 1', prompt: 'Check the king and attack the knight at the same time.', accept: ['a1a5', 'a1h8'], explain: 'Qa5+ (or Qh8+) gives check and attacks the loose knight on h5. After the king moves, the knight falls.', hint: 'Which queen checks also line up with h5?' }),
    ],
    quiz: [
      { fen: '4k3/8/8/1b6/8/8/8/4K2Q w - - 0 1', prompt: 'White to move. One queen check also hits the loose bishop.', accept: ['h1h5'], explain: 'Qh5+ checks along the diagonal and attacks the bishop on b5 along the fifth rank.', hint: 'Find a check that lands on the fifth rank.' },
    ],
  },
  {
    id: 'mates', unit: 'Checkmate', title: 'Checkmate patterns', summary: 'Back rank, the supported queen and the smothered mate.', practice: 'mateIn1',
    steps: [
      t('A king behind its own unmoved pawns has no escape squares. A rook or queen on its back rank is checkmate. This back-rank mate decides many games at every level.'),
      task({ fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', prompt: 'Deliver back-rank mate.', accept: ['a1a8'], explain: 'Ra8# — the king is trapped by its own pawns.', hint: 'Use the open a-file.' }),
      t('Give your own king an escape square (often with h3 or g3) once the danger appears.'),
    ],
    quiz: [
      { fen: 'k7/5Q2/1K6/8/8/8/8/8 w - - 0 1', prompt: 'White to move. Mate with the queen, supported by the king.', accept: ['f7b7'], explain: 'Qb7# — the queen is protected by the king, so it can’t be taken.', hint: 'Put the queen right next to the king where your king protects it.' },
      { fen: '6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1', prompt: 'White to move. The king is surrounded by its own pieces.', accept: ['h6f7'], explain: 'Nf7# is a smothered mate: the king’s own rook and pawns block every square.', hint: 'Only a knight can check through a wall.' },
    ],
  },
  {
    id: 'opening', unit: 'Openings', title: 'Opening principles', summary: 'Centre, development, king safety.', practice: 'opening',
    steps: [
      t('In the first ten moves: put a pawn or two in the centre, bring out knights and bishops, castle, then connect your rooks. Avoid moving the same piece twice and avoid bringing the queen out early.'),
      task({ fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', prompt: 'Develop a piece toward the centre.', accept: ['g1f3', 'b1c3', 'f1c4'], explain: 'Nf3 develops and attacks e5. Nc3 and Bc4 also follow the principles.', hint: 'Knights before bishops is a good rule of thumb.' }),
    ],
    quiz: [
      { fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', prompt: 'White to move. Keep following the principles.', accept: ['e1g1', 'c2c3', 'd2d3', 'b1c3'], explain: 'Castling gets the king safe. c3 and d3 prepare the centre, and Nc3 develops.', hint: 'Your king is still in the centre.' },
      { fen: 'rnbqkb1r/ppp2ppp/4pn2/3p4/3P1B2/4P3/PPP2PPP/RN1QKBNR w KQkq - 0 4', prompt: 'White to move. Develop.', accept: ['g1f3', 'b1d2', 'f1d3', 'c2c4'], explain: 'Nf3, Nd2 and Bd3 develop pieces; c4 challenges the centre.', hint: 'Which minor pieces are still at home?' },
    ],
  },
  {
    id: 'pawns', unit: 'Strategy', title: 'Pawn structure', summary: 'Passed pawns, weak pawns and breakthroughs.', practice: 'advancedPawn',
    steps: [
      t('A passed pawn has no enemy pawns in front of it or on the files next to it. Passed pawns win endgames. Isolated and doubled pawns are weaknesses because other pawns can’t defend them.'),
      task({ fen: '7k/ppp5/8/PPP5/8/8/8/7K w - - 0 1', prompt: 'Three pawns against three. Break through.', accept: ['b5b6'], explain: 'b6! If axb6 then c6!, and if cxb6 then a6!: one white pawn always gets through.', hint: 'Sacrifice the middle pawn.' }),
    ],
    quiz: [
      { fen: '7k/ppp5/8/PPP5/8/8/8/7K w - - 0 1', prompt: 'Once more: find the breakthrough.', accept: ['b5b6'], explain: 'b6 creates a passed pawn by force.', hint: 'Start in the middle.' },
    ],
  },
  {
    id: 'convert', unit: 'Strategy', title: 'Converting an advantage', summary: 'When ahead, trade pieces and stay safe.', practice: 'endgame',
    steps: [
      t('When you are ahead in material, trade pieces (not pawns). Every trade makes your extra material count for more and reduces your opponent’s chances to attack.'),
      task({ fen: '4k3/3q1ppp/8/8/8/8/5PPP/R2Q2K1 w - - 0 1', prompt: 'You are a rook up. Offer the queen trade.', accept: ['d1d7'], explain: 'Qxd7+ Kxd7 leaves a simple rook-up endgame with no counterplay.', hint: 'The queens face each other on the d-file.' }),
    ],
    quiz: [],
  },
  {
    id: 'kp', unit: 'Endgames', title: 'King and pawn: the opposition', summary: 'Key squares and taking the opposition.', practice: 'endgame',
    steps: [
      t('In king-and-pawn endgames the king leads. The “opposition” means your king faces the enemy king with one square between them and the opponent to move, so their king must give way.'),
      t('With a pawn on e2, the key squares are d4, e4 and f4. If your king reaches one of them, the pawn queens.'),
      task({ fen: '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', prompt: 'Walk your king to a key square.', accept: ['e3e4', 'e3d4', 'e3f4'], explain: 'From d4, e4 or f4 your king escorts the pawn and wins.', hint: 'Move the king in front of the pawn, two ranks up.' }),
    ],
    quiz: [
      { fen: '3k4/8/3K4/3P4/8/8/8/8 w - - 0 1', prompt: 'White to move. King on the sixth rank in front of the pawn: win it.', accept: ['d6c6', 'd6e6'], explain: 'Stepping aside (Kc6 or Ke6) lets the pawn advance; Black can’t stop it.', hint: 'Step to the side, don’t push yet.' },
    ],
  },
  {
    id: 'ladder', unit: 'Endgames', title: 'The ladder mate', summary: 'Two rooks walk the king to the edge.', practice: 'endgame',
    steps: [
      t('With two rooks, one rook cuts the king off along a rank while the other gives check on the next rank. Step by step the king is pushed to the edge.'),
      task({ fen: '8/8/8/4k3/8/8/R7/1R4K1 w - - 0 1', prompt: 'Start the ladder with a check.', accept: ['a2a5', 'b1b5', 'a2a4', 'b1b4'], explain: 'Checking on the fifth rank (or cutting along the fourth) starts the ladder.', hint: 'Use a rook along a rank.' }),
    ],
    quiz: [
      { fen: '6k1/R7/1R6/8/8/8/8/6K1 w - - 0 1', prompt: 'White to move. Finish the ladder.', accept: ['b6b8'], explain: 'Rb8# — the a7 rook covers the seventh rank.', hint: 'One rook guards the seventh rank already.' },
    ],
  },
  {
    id: 'kq', unit: 'Endgames', title: 'King and queen against king', summary: 'Box the king, bring your king, and avoid stalemate.', practice: 'endgame',
    steps: [
      t('Keep the queen a knight’s move away from the enemy king to shrink its box, then bring your own king close. Careful: if the king has no moves and is not in check, it is stalemate, a draw.'),
      task({ fen: 'k7/8/2K5/8/8/8/8/1Q6 w - - 0 1', prompt: 'Mate in one, without stalemate.', accept: ['b1b7'], explain: 'Qb7# is protected by the king. Moves like Qb6 would be stalemate.', hint: 'Your king on c6 protects b7.' }),
    ],
    quiz: [],
  },
  {
    id: 'lucas', unit: 'Endgames', title: 'The Lucas position', summary: 'Building a bridge to queen the pawn.', practice: 'endgame',
    steps: [
      t('Rook and pawn against rook: your king is stuck in front of its own pawn and the enemy rook checks from the side. The winning plan is to “build a bridge”: drive the enemy king away, put your rook on the fourth rank, then use it to block the checks.'),
      task({ fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', prompt: 'First, drive the black king away.', accept: ['c1d1'], explain: 'Rd1+ pushes the king to the e-file, freeing c7 and c8 for your king.', hint: 'Check along the d-file.' }),
    ],
    quiz: [
      { fen: '1K6/1P2k3/8/8/8/8/r7/3R4 w - - 0 1', prompt: 'White to move. Build the bridge.', accept: ['d1d4'], explain: 'Rd4! prepares to block checks on b4 once the king walks out.', hint: 'Put the rook on the fourth rank.' },
    ],
  },
  {
    id: 'plan', unit: 'Strategy', title: 'How to make a plan', summary: 'Targets, worst pieces and simple ideas.', practice: 'middlegame',
    steps: [
      t('When there is no tactic, ask: which of my pieces is doing least? Improve it. Which enemy pawn or square is weak? Aim at it. Make one threat at a time, and before each move do your blunder check.'),
      task({ fen: 'r4rk1/pp3ppp/2n1b3/3p4/3N4/4P3/PP2BPPP/R2Q1RK1 w - - 0 1', prompt: 'Black’s d5 pawn is isolated. Find a move that pressures it or the pieces around it.', accept: ['e2f3', 'd4e6', 'd4c6', 'd1b3'], explain: 'Bf3 and Qb3 aim at d5, and trading knights removes a defender.', hint: 'Which pieces can attack d5?' }),
    ],
    quiz: [],
  },
];

export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);
