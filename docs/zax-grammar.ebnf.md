# ZAX Grammar (EBNF Companion)

This file provides a single syntax-oriented grammar reference for ZAX.

Authority note:

- `docs/zax-spec.md` remains the sole normative language authority.
- If this grammar and the spec ever diverge, `docs/zax-spec.md` wins.

## 1. Lexical

```ebnf
identifier      = letter , { letter | digit | "_" } ;
letter          = "A".."Z" | "a".."z" | "_" ;
digit           = "0".."9" ;

int_dec         = [ "-" ] , digit , { digit } ;
int_hex         = "$" , hex_digit , { hex_digit } ;
hex_digit       = digit | "A".."F" | "a".."f" ;

string_lit      = '"' , { any_char_except_quote } , '"' ;
newline         = "\n" ;
```

## 2. Module Structure

```ebnf
module          = { module_item } ;

module_item     = import_decl
                | section_decl
                | align_decl
                | const_decl
                | enum_decl
                | type_decl
                | union_decl
                | globals_block
                | data_block
                | bin_decl
                | hex_decl
                | extern_block
                | func_decl
                | op_decl ;

import_decl     = "import" , ( identifier | string_lit ) ;
section_decl    = "section" , section_kind , [ "at" , imm_expr ] ;
section_kind    = "code" | "data" | "var" ;
align_decl      = "align" , imm_expr ;
```

## 3. Types and Declarations

```ebnf
const_decl      = "const" , identifier , "=" , imm_expr ;

enum_decl       = "enum" , identifier , enum_member , { "," , enum_member } ;
enum_member     = identifier ;

type_decl       = "type" , identifier , type_body ;
union_decl      = "union" , identifier , field_block ;

type_body       = type_expr
                | field_block ;

field_block     = newline , field_decl , { newline , field_decl } , newline , "end" ;
field_decl      = identifier , ":" , type_expr ;

type_expr       = scalar_type
                | identifier
                | type_expr , "[" , [ imm_expr ] , "]" ;

scalar_type     = "byte" | "word" | "addr" | "ptr" ;
```

## 4. Storage Blocks

```ebnf
globals_block   = "globals" , newline , globals_decl , { newline , globals_decl } ;

globals_decl    = identifier , ":" , type_expr                              (* storage decl *)
                | identifier , ":" , type_expr , "=" , value_init_expr      (* typed value-init *)
                | identifier , "=" , rhs_alias_expr ;                        (* alias-init, inferred *)

data_block      = "data" , newline , data_decl , { newline , data_decl } ;

data_decl       = identifier , ":" , type_expr , "=" , data_init_expr ;

bin_decl        = "bin" , identifier , "in" , section_kind , "from" , string_lit ;
hex_decl        = "hex" , identifier , "from" , string_lit ;
```

## 5. Functions and Ops

```ebnf
func_decl       = [ "export" ] , "func" , identifier , "(" , [ param_list ] , ")" ,
                  ":" , ret_type , newline , [ local_var_block ] , instr_stream , "end" ;

ret_type        = "void" | type_expr ;
param_list      = param , { "," , param } ;
param           = identifier , ":" , type_expr ;

local_var_block = "var" , newline , local_decl , { newline , local_decl } , newline , "end" ;

local_decl      = identifier , ":" , type_expr                              (* local scalar decl *)
                | identifier , ":" , type_expr , "=" , value_init_expr      (* local scalar value-init *)
                | identifier , "=" , rhs_alias_expr ;                        (* local alias-init *)

op_decl         = "op" , identifier , [ "(" , [ op_param_list ] , ")" ] ,
                  newline , instr_stream , "end" ;

op_param_list   = op_param , { "," , op_param } ;
op_param        = identifier , ":" , matcher_type ;

matcher_type    = "reg8" | "reg16"
                | "A" | "HL" | "DE" | "BC" | "SP"
                | "imm8" | "imm16"
                | "ea" | "mem8" | "mem16"
                | "idx16" | "cc" ;
```

## 6. Instruction Stream and Structured Control

```ebnf
instr_stream    = { instr_line } ;

instr_line      = z80_instruction
                | op_invoke
                | func_call
                | if_stmt
                | while_stmt
                | repeat_stmt
                | select_stmt
                | local_label
                | local_jump ;

if_stmt         = "if" , cc_expr , newline , instr_stream ,
                  [ "else" , newline , instr_stream ] , "end" ;

while_stmt      = "while" , cc_expr , newline , instr_stream , "end" ;

repeat_stmt     = "repeat" , newline , instr_stream , "until" , cc_expr ;

select_stmt     = "select" , select_expr , newline ,
                  case_clause , { case_clause } , [ else_clause ] , "end" ;

case_clause     = "case" , imm_expr , newline , instr_stream ;
else_clause     = "else" , newline , instr_stream ;

local_label     = "." , identifier , ":" ;
local_jump      = ( "jp" | "jr" | "djnz" ) , "." , identifier ;
```

## 7. Expressions

```ebnf
imm_expr        = imm_or ;
imm_or          = imm_xor , { "|" , imm_xor } ;
imm_xor         = imm_and , { "^" , imm_and } ;
imm_and         = imm_shift , { "&" , imm_shift } ;
imm_shift       = imm_add , { ( "<<" | ">>" ) , imm_add } ;
imm_add         = imm_mul , { ( "+" | "-" ) , imm_mul } ;
imm_mul         = imm_unary , { ( "*" | "/" | "%" ) , imm_unary } ;
imm_unary       = [ "-" | "+" | "~" ] , imm_primary ;
imm_primary     = int_dec | int_hex | identifier | enum_ref | "(" , imm_expr , ")"
                | "sizeof" , "(" , type_expr , ")"
                | "offsetof" , "(" , type_expr , "," , field_path , ")" ;

enum_ref        = identifier , "." , identifier ;

field_path      = identifier , { "." , identifier | "[" , imm_expr , "]" } ;

ea_expr         = ea_term , { ( "+" | "-" ) , imm_expr } ;
ea_term         = ea_base , { ea_segment } ;
ea_base         = identifier | "(" , ea_expr , ")" ;
ea_segment      = "." , identifier | "[" , ea_index , "]" ;
ea_index        = imm_expr | reg8 | reg16 | "(" , reg16 , ")" ;

value_init_expr = imm_expr | "0" ;
rhs_alias_expr  = ea_expr ;
data_init_expr  = string_lit | aggregate_init | imm_expr ;
aggregate_init  = "{" , [ init_item , { "," , init_item } ] , "}" ;
init_item       = imm_expr | aggregate_init ;
```

## 8. Known v0.2 Constraints (Semantic)

These are semantic constraints enforced beyond pure grammar:

- Typed alias form is invalid in both globals and local `var`:
  - `name: Type = rhsAlias`
- Local non-scalar value-init declarations are invalid.
- Local non-scalar declarations are alias-only (`name = rhs`).
- `@place` explicit address-of syntax is deferred to v0.3.
- `globals` composite aggregate initializer forms may be subset-constrained by current implementation; check `docs/zax-spec.md` and implementation issues for current support.

## 9. Maintenance Rule

When parser grammar changes land:

1. Update this file in the same PR.
2. Update `docs/zax-spec.md` if behavior changed.
3. Include at least one positive and one negative parser/semantic test for the changed production.
