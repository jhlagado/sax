; ZAX lowered .asm trace
; range: $0100..$015B (end exclusive)

; func inc_one begin
inc_one:
push BC                        ; 0100: C5
ld HL, $0002                   ; 0101: 21 02 00
add HL, SP                     ; 0104: 39
ld (HL), $0000                 ; 0105: 36 00
inc HL                         ; 0107: 23
ld (HL), $0000                 ; 0108: 36 00
ld HL, $0004                   ; 010A: 21 04 00
add HL, SP                     ; 010D: 39
push AF                        ; 010E: F5
ld A, (HL)                     ; 010F: 7E
inc HL                         ; 0110: 23
ld H, (HL)                     ; 0111: 66
ld L, A                        ; 0112: 6F
pop AF                         ; 0113: F1
inc HL                         ; 0114: 23
push HL                        ; 0115: E5
ld HL, $0002                   ; 0116: 21 02 00
add HL, SP                     ; 0119: 39
pop DE                         ; 011A: D1
ld (hl), e ; inc hl ; ld (hl), d ; 011B: 73 23 72
ld HL, $0000                   ; 011E: 21 00 00
add HL, SP                     ; 0121: 39
push AF                        ; 0122: F5
ld A, (HL)                     ; 0123: 7E
inc HL                         ; 0124: 23
ld H, (HL)                     ; 0125: 66
ld L, A                        ; 0126: 6F
pop AF                         ; 0127: F1
jp __zax_epilogue_0            ; 0128: C3 00 00
__zax_epilogue_0:
pop BC                         ; 012B: C1
ret                            ; 012C: C9
; func inc_one end
; func main begin
main:
push BC                        ; 012D: C5
ld HL, $0002                   ; 012E: 21 02 00
add HL, SP                     ; 0131: 39
ld (HL), $0000                 ; 0132: 36 00
inc HL                         ; 0134: 23
ld (HL), $0000                 ; 0135: 36 00
push AF                        ; 0137: F5
push BC                        ; 0138: C5
push DE                        ; 0139: D5
push IX                        ; 013A: DD E5
push IY                        ; 013C: FD E5
ld HL, $0005                   ; 013E: 21 05 00
push HL                        ; 0141: E5
call inc_one                   ; 0142: CD 00 00
pop BC                         ; 0145: C1
pop IY                         ; 0146: FD E1
pop IX                         ; 0148: DD E1
pop DE                         ; 014A: D1
pop BC                         ; 014B: C1
pop AF                         ; 014C: F1
push HL                        ; 014D: E5
ld HL, $0002                   ; 014E: 21 02 00
add HL, SP                     ; 0151: 39
pop DE                         ; 0152: D1
ld (hl), e ; inc hl ; ld (hl), d ; 0153: 73 23 72
jp __zax_epilogue_1            ; 0156: C3 00 00
__zax_epilogue_1:
pop BC                         ; 0159: C1
ret                            ; 015A: C9
; func main end

; symbols:
; label inc_one = $0100
; label __zax_epilogue_0 = $012B
; label main = $012D
; label __zax_epilogue_1 = $0159
