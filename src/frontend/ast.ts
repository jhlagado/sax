export interface SourcePosition {
  line: number; // 1-based
  column: number; // 1-based
  offset: number; // 0-based byte offset in the file
}

export interface SourceSpan {
  file: string; // user-facing file path (as provided on input)
  start: SourcePosition;
  end: SourcePosition;
}

export interface BaseNode {
  kind: string;
  span: SourceSpan;
}

export interface ProgramNode extends BaseNode {
  kind: 'Program';
  entryFile: string;
  files: ModuleFileNode[];
}

export interface ModuleFileNode extends BaseNode {
  kind: 'ModuleFile';
  path: string;
  items: ModuleItemNode[];
}

export type ModuleItemNode =
  | ImportNode
  | ConstDeclNode
  | EnumDeclNode
  | DataBlockNode
  | VarBlockNode
  | FuncDeclNode
  | UnionDeclNode
  | TypeDeclNode
  | ExternDeclNode
  | BinDeclNode
  | HexDeclNode
  | OpDeclNode
  | SectionDirectiveNode
  | AlignDirectiveNode
  | UnimplementedNode;

export interface UnimplementedNode extends BaseNode {
  kind: 'Unimplemented';
  note: string;
}

export interface ImportNode extends BaseNode {
  kind: 'Import';
  specifier: string;
  form: 'moduleId' | 'path';
}

export interface SectionDirectiveNode extends BaseNode {
  kind: 'Section';
  section: 'code' | 'data' | 'var';
  at?: ImmExprNode;
}

export interface AlignDirectiveNode extends BaseNode {
  kind: 'Align';
  value: ImmExprNode;
}

export interface TypeDeclNode extends BaseNode {
  kind: 'TypeDecl';
  name: string;
  typeExpr: TypeExprNode;
}

export interface UnionDeclNode extends BaseNode {
  kind: 'UnionDecl';
  name: string;
  fields: RecordFieldNode[];
}

export interface EnumDeclNode extends BaseNode {
  kind: 'EnumDecl';
  name: string;
  members: string[];
}

export interface ConstDeclNode extends BaseNode {
  kind: 'ConstDecl';
  name: string;
  exported: boolean;
  value: ImmExprNode;
}

export interface VarBlockNode extends BaseNode {
  kind: 'VarBlock';
  scope: 'module' | 'function';
  decls: VarDeclNode[];
}

export interface VarDeclNode extends BaseNode {
  kind: 'VarDecl';
  name: string;
  typeExpr: TypeExprNode;
}

export interface DataBlockNode extends BaseNode {
  kind: 'DataBlock';
  decls: DataDeclNode[];
}

export interface DataDeclNode extends BaseNode {
  kind: 'DataDecl';
  name: string;
  typeExpr: TypeExprNode;
  initializer: DataInitializerNode;
}

export type DataInitializerNode =
  | { kind: 'InitArray'; span: SourceSpan; elements: ImmExprNode[] }
  | { kind: 'InitString'; span: SourceSpan; value: string };

export interface BinDeclNode extends BaseNode {
  kind: 'BinDecl';
  name: string;
  section: 'code' | 'data' | 'var';
  fromPath: string;
}

export interface HexDeclNode extends BaseNode {
  kind: 'HexDecl';
  name: string;
  fromPath: string;
}

export interface ExternDeclNode extends BaseNode {
  kind: 'ExternDecl';
  base?: string;
  funcs: ExternFuncNode[];
}

export interface ExternFuncNode extends BaseNode {
  kind: 'ExternFunc';
  name: string;
  params: ParamNode[];
  returnType: TypeExprNode;
  at: ImmExprNode;
}

export interface FuncDeclNode extends BaseNode {
  kind: 'FuncDecl';
  name: string;
  exported: boolean;
  params: ParamNode[];
  returnType: TypeExprNode;
  locals?: VarBlockNode;
  asm: AsmBlockNode;
}

export interface OpDeclNode extends BaseNode {
  kind: 'OpDecl';
  name: string;
  exported: boolean;
  params: OpParamNode[];
  body: AsmBlockNode;
}

export interface ParamNode extends BaseNode {
  kind: 'Param';
  name: string;
  typeExpr: TypeExprNode;
}

export interface OpParamNode extends BaseNode {
  kind: 'OpParam';
  name: string;
  matcher: OpMatcherNode;
}

export type OpMatcherNode =
  | { kind: 'MatcherReg8'; span: SourceSpan }
  | { kind: 'MatcherReg16'; span: SourceSpan }
  | { kind: 'MatcherImm8'; span: SourceSpan }
  | { kind: 'MatcherImm16'; span: SourceSpan }
  | { kind: 'MatcherEa'; span: SourceSpan }
  | { kind: 'MatcherMem8'; span: SourceSpan }
  | { kind: 'MatcherMem16'; span: SourceSpan }
  | { kind: 'MatcherFixed'; span: SourceSpan; token: string };

export interface AsmBlockNode extends BaseNode {
  kind: 'AsmBlock';
  items: AsmItemNode[];
}

export type AsmItemNode =
  | AsmInstructionNode
  | AsmControlNode
  | AsmLabelNode
  | UnimplementedNode;

export interface AsmLabelNode extends BaseNode {
  kind: 'AsmLabel';
  name: string;
}

export interface AsmInstructionNode extends BaseNode {
  kind: 'AsmInstruction';
  head: string;
  operands: AsmOperandNode[];
}

export type AsmControlNode =
  | { kind: 'If'; span: SourceSpan; cc: string }
  | { kind: 'Else'; span: SourceSpan }
  | { kind: 'End'; span: SourceSpan }
  | { kind: 'While'; span: SourceSpan; cc: string }
  | { kind: 'Repeat'; span: SourceSpan }
  | { kind: 'Until'; span: SourceSpan; cc: string }
  | { kind: 'Select'; span: SourceSpan; selector: AsmOperandNode }
  | { kind: 'Case'; span: SourceSpan; value: ImmExprNode }
  | { kind: 'SelectElse'; span: SourceSpan };

export type AsmOperandNode =
  | { kind: 'Reg'; span: SourceSpan; name: string }
  | { kind: 'Imm'; span: SourceSpan; expr: ImmExprNode }
  | { kind: 'Ea'; span: SourceSpan; expr: EaExprNode }
  | { kind: 'Mem'; span: SourceSpan; expr: EaExprNode }
  | { kind: 'PortC'; span: SourceSpan }
  | { kind: 'PortImm8'; span: SourceSpan; expr: ImmExprNode };

export type TypeExprNode =
  | { kind: 'TypeName'; span: SourceSpan; name: string }
  | { kind: 'ArrayType'; span: SourceSpan; element: TypeExprNode; length?: number }
  | { kind: 'RecordType'; span: SourceSpan; fields: RecordFieldNode[] };

export interface RecordFieldNode extends BaseNode {
  kind: 'RecordField';
  name: string;
  typeExpr: TypeExprNode;
}

export type ImmExprNode =
  | { kind: 'ImmLiteral'; span: SourceSpan; value: number }
  | { kind: 'ImmName'; span: SourceSpan; name: string }
  | { kind: 'ImmUnary'; span: SourceSpan; op: '+' | '-' | '~'; expr: ImmExprNode }
  | {
      kind: 'ImmBinary';
      span: SourceSpan;
      op: '*' | '/' | '%' | '+' | '-' | '&' | '^' | '|' | '<<' | '>>';
      left: ImmExprNode;
      right: ImmExprNode;
    };

export type EaExprNode =
  | { kind: 'EaName'; span: SourceSpan; name: string }
  | { kind: 'EaField'; span: SourceSpan; base: EaExprNode; field: string }
  | { kind: 'EaIndex'; span: SourceSpan; base: EaExprNode; index: EaIndexNode }
  | { kind: 'EaAdd'; span: SourceSpan; base: EaExprNode; offset: ImmExprNode }
  | { kind: 'EaSub'; span: SourceSpan; base: EaExprNode; offset: ImmExprNode };

export type EaIndexNode =
  | { kind: 'IndexImm'; span: SourceSpan; value: ImmExprNode }
  | { kind: 'IndexReg8'; span: SourceSpan; reg: string }
  | { kind: 'IndexMemHL'; span: SourceSpan };

export type Node =
  | ProgramNode
  | ModuleFileNode
  | ModuleItemNode
  | VarDeclNode
  | DataDeclNode
  | ParamNode
  | OpParamNode
  | RecordFieldNode
  | AsmBlockNode
  | AsmItemNode
  | AsmControlNode
  | AsmOperandNode
  | TypeExprNode
  | ImmExprNode
  | EaExprNode
  | EaIndexNode
  | DataInitializerNode
  | OpMatcherNode;
