; ZAX expected lowered .asm trace (v0.2 spec-aligned)
; source: 00_call_with_arg_and_local_baseline.zax
; notes:
; - IX-anchored frame model
; - args at IX+4.., locals at IX-1..
; - typed-call boundary: HL volatile/return channel, non-HL boundary state preserved by typed-call glue
; - framed funcs use a synthetic epilogue path

; func inc_one begin (expected)
inc_one:
PUSH IX
LD IX, $0000
ADD IX, SP
LD HL, $0000
PUSH HL                       ; temp_word: word = 0
LD HL, $0064
PUSH HL                       ; unused_word: word = 100
PUSH AF                       ; conservative callee-preserved set (current policy)
PUSH BC
PUSH DE
LD E, (IX+$04)                ; input_word low
LD D, (IX+$05)                ; input_word high
INC DE
LD (IX-$02), E                ; temp_word = DE
LD (IX-$01), D
LD E, (IX-$02)                ; DE = temp_word
LD D, (IX-$01)
EX DE, HL                     ; return channel
POP DE
POP BC
POP AF
LD SP, IX
POP IX
RET
; func inc_one end

; func main begin (expected)
main:
PUSH IX
LD IX, $0000
ADD IX, SP
LD HL, $0000
PUSH HL                       ; allocate+init result_word = 0 (HL treated volatile)
LD HL, $0005                  ; call arg
PUSH HL
CALL inc_one
INC SP                        ; caller arg cleanup (word)
INC SP
EX DE, HL
LD (IX-$02), E                ; result_word = HL
LD (IX-$01), D
EX DE, HL
LD SP, IX
POP IX
RET
; func main end
