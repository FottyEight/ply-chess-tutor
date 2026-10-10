// A small repertoire for a ~1000 player. `ideas` explain the learner's own moves (keyed by ply index, 0 = 1st move).
export interface RepLine { id: string; opening: string; name: string; side: 'w' | 'b'; moves: string[]; ideas: Record<number, string> }

export const REPERTOIRE: RepLine[] = [
  {
    id: 'it-pianissimo', opening: 'Italian Game', name: 'Giuoco Pianissimo', side: 'w',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'O-O', 'Re1', 'a6', 'Bb3'],
    ideas: { 0: 'Take the centre and open lines for the queen and bishop.', 2: 'Develop and attack e5.', 4: 'The bishop aims at f7, Black’s weakest square.', 6: 'Prepare d4 and give the bishop a retreat on c2 later.', 8: 'Solidly protect e4; the slow, safe Italian.', 10: 'King safety first.', 12: 'The rook supports e4 and a later d4.', 14: 'Keep the bishop away from …Na5 or …b5 tricks.' },
  },
  {
    id: 'it-twoknights', opening: 'Italian Game', name: 'Two Knights, quiet line', side: 'w',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Be7', 'O-O', 'O-O', 'Re1', 'd6', 'c3'],
    ideas: { 0: 'Centre pawn.', 2: 'Knight develops with a threat to e5.', 4: 'Bishop to its best diagonal.', 6: 'Protects e4 calmly; avoids sharp gambits.', 8: 'Castle early.', 10: 'Rook behind the e-pawn.', 12: 'Prepare d4 to grab more centre.' },
  },
  {
    id: 'london-main', opening: 'London System', name: 'Against …d5 and …e6', side: 'w',
    moves: ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'e6', 'Nf3', 'Bd6', 'Bg3', 'O-O', 'Nbd2', 'c5', 'c3', 'Nc6', 'Bd3'],
    ideas: { 0: 'Queen’s pawn opening.', 2: 'Get the bishop out before e3 locks it in. This is the London.', 4: 'Support d4 and open the other bishop.', 6: 'Develop and control e5.', 8: 'Keep the bishop; trading on d6 would help Black.', 10: 'Knight to d2 keeps c3 for a pawn.', 12: 'The pyramid c3–d4–e3 is very solid.', 14: 'Bishop to its natural attacking square.' },
  },
  {
    id: 'london-kid', opening: 'London System', name: 'Against the King’s Indian setup', side: 'w',
    moves: ['d4', 'Nf6', 'Bf4', 'g6', 'e3', 'Bg7', 'Nf3', 'O-O', 'Be2', 'd6', 'h3'],
    ideas: { 0: 'Centre pawn.', 2: 'The London bishop comes out first.', 4: 'Solid centre.', 6: 'Develop.', 8: 'A modest square: the bishop stays safe from …Nd5 or …e5 tricks.', 10: 'Gives the f4 bishop a retreat on h2 and stops …Ng4 or …Bg4.' },
  },
  {
    id: 'ck-classical', opening: 'Caro-Kann Defence', name: 'Classical', side: 'b',
    moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5', 'Ng3', 'Bg6', 'h4', 'h6', 'Nf3', 'Nd7', 'h5', 'Bh7'],
    ideas: { 1: 'Prepare …d5 with a solid pawn chain.', 3: 'Challenge the centre.', 5: 'Release the tension; your bishop gets the f5 square.', 7: 'Develop the light-squared bishop before …e6 locks it in.', 9: 'Keep the bishop on the useful diagonal.', 11: 'Give the bishop a hole on h7 and stop h5 trapping it.', 13: 'Develop flexibly; supports …Ngf6 and …e6.', 15: 'The bishop is safe on h7 and still eyes White’s queenside.' },
  },
  {
    id: 'ck-advance', opening: 'Caro-Kann Defence', name: 'Advance Variation', side: 'b',
    moves: ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'e6', 'Be2', 'Nd7', 'O-O', 'Ne7'],
    ideas: { 1: 'Caro-Kann.', 3: 'Strike at the centre.', 5: 'Bishop outside the pawn chain first.', 7: 'Now lock in the solid chain.', 9: 'Prepare …c5 to attack White’s chain.', 11: 'The knight heads for g6 or c6, avoiding e5 being pushed further.' },
  },
  {
    id: 'ck-exchange', opening: 'Caro-Kann Defence', name: 'Exchange Variation', side: 'b',
    moves: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'Bd3', 'Nc6', 'c3', 'Nf6', 'Bf4', 'Bg4'],
    ideas: { 1: 'Caro-Kann.', 3: 'Challenge e4.', 5: 'Recapture with the c-pawn, keeping a central pawn on d5.', 7: 'Develop and pressure d4.', 9: 'Natural development.', 11: 'Develop the bishop actively before …e6.' },
  },
  {
    id: 'qgd-main', opening: 'Queen’s Gambit Declined', name: 'Main line with Bg5', side: 'b',
    moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'h6', 'Bh4', 'b6'],
    ideas: { 1: 'Claim the centre.', 3: 'Decline the gambit: keep d5 solidly protected.', 5: 'Develop and defend d5.', 7: 'Unpin the knight.', 9: 'King safety.', 11: 'Ask the bishop: trade or retreat.', 13: 'Prepare …Bb7 to develop the problem bishop (the Tartakower plan).' },
  },
  {
    id: 'qgd-bf4', opening: 'Queen’s Gambit Declined', name: 'Against Bf4', side: 'b',
    moves: ['d4', 'd5', 'c4', 'e6', 'Nf3', 'Nf6', 'Nc3', 'Be7', 'Bf4', 'O-O', 'e3', 'c5'],
    ideas: { 1: 'Centre pawn.', 3: 'Solid QGD.', 5: 'Develop.', 7: 'Prepare castling.', 9: 'King safe.', 11: 'Hit d4: the freeing break in this line.' },
  },
  {
    id: 'qgd-colle', opening: 'Queen’s Gambit Declined', name: 'Against quiet systems', side: 'b',
    moves: ['d4', 'd5', 'Nf3', 'Nf6', 'e3', 'e6', 'Bd3', 'c5', 'b3', 'Nc6'],
    ideas: { 1: 'Centre pawn.', 3: 'Develop.', 5: 'Solid QGD setup.', 7: 'Strike at d4 before White gets e4 in.', 9: 'Develop and add pressure to d4.' },
  },
];
