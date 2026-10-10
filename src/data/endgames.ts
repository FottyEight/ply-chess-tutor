export interface EndgameDrill { id: string; title: string; goal: 'win' | 'draw'; side: 'w' | 'b'; fen: string; tip: string }
export const ENDGAMES: EndgameDrill[] = [
  { id: 'kq-k', title: 'King and queen against king', goal: 'win', side: 'w', fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1', tip: 'Box the king with the queen a knight’s move away, bring your king, and watch out for stalemate.' },
  { id: 'krr-k', title: 'Two rooks: the ladder', goal: 'win', side: 'w', fen: '8/8/3k4/8/8/8/8/R3K2R w - - 0 1', tip: 'One rook cuts off a rank, the other checks on the next one.' },
  { id: 'kr-k', title: 'King and rook against king', goal: 'win', side: 'w', fen: '8/8/8/4k3/8/8/8/4K2R w - - 0 1', tip: 'Use the rook to fence the king in, and the king to take the opposition.' },
  { id: 'kp-6th', title: 'King on the sixth: queen the pawn', goal: 'win', side: 'w', fen: '3k4/8/3K4/3P4/8/8/8/8 w - - 0 1', tip: 'Step aside first; push the pawn when the black king has to give way.' },
  { id: 'kp-defend', title: 'Hold the draw with the opposition', goal: 'draw', side: 'b', fen: '8/4k3/8/8/4K3/4P3/8/8 b - - 0 1', tip: 'Face the white king with one square between you. Retreat straight back when the pawn advances.' },
  { id: 'lucas', title: 'The Lucas position', goal: 'win', side: 'w', fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', tip: 'Rd1+, then Rd4, walk out with the king and block the checks with the rook.' },
  { id: 'philidor', title: 'The Philidor defence', goal: 'draw', side: 'b', fen: '4k3/7R/r7/3KP3/8/8/8/8 b - - 0 1', tip: 'Keep your rook on the sixth rank. When the pawn reaches e6, check from behind.' },
];
