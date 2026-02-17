; ZAX lowered .asm trace
; range: $0100..$01D5 (end exclusive)

; func fib begin
fib:
push BC                        ; 0100: C5
push BC                        ; 0101: C5
push BC                        ; 0102: C5
push BC                        ; 0103: C5
ld HL, $0008                   ; 0104: 21 08 00
add HL, SP                     ; 0107: 39
ld (HL), $0000                 ; 0108: 36 00
inc HL                         ; 010A: 23
ld (HL), $0000                 ; 010B: 36 00
ld HL, $000A                   ; 010D: 21 0A 00
add HL, SP                     ; 0110: 39
ld (HL), $0001                 ; 0111: 36 01
inc HL                         ; 0113: 23
ld (HL), $0000                 ; 0114: 36 00
ld HL, $000C                   ; 0116: 21 0C 00
add HL, SP                     ; 0119: 39
ld (HL), $0000                 ; 011A: 36 00
inc HL                         ; 011C: 23
ld (HL), $0000                 ; 011D: 36 00
ld HL, $000E                   ; 011F: 21 0E 00
add HL, SP                     ; 0122: 39
ld (HL), $0000                 ; 0123: 36 00
inc HL                         ; 0125: 23
ld (HL), $0000                 ; 0126: 36 00
__zax_while_cond_1:
jp cc, __zax_while_end_2       ; 0128: CA 00 00
ld HL, $0004                   ; 012B: 21 04 00
add HL, SP                     ; 012E: 39
push AF                        ; 012F: F5
ld A, (HL)                     ; 0130: 7E
inc HL                         ; 0131: 23
ld H, (HL)                     ; 0132: 66
ld L, A                        ; 0133: 6F
pop AF                         ; 0134: F1
ld HL, $000A                   ; 0135: 21 0A 00
add HL, SP                     ; 0138: 39
ld a, (hl) ; inc hl ; ld d, (hl) ; ld e, a ; 0139: 7E 23 56 5F
xor A                          ; 013D: AF
sbc HL, DE                     ; 013E: ED 52
jp cc, __zax_if_else_3         ; 0140: C2 00 00
ld HL, $0000                   ; 0143: 21 00 00
add HL, SP                     ; 0146: 39
push AF                        ; 0147: F5
ld A, (HL)                     ; 0148: 7E
inc HL                         ; 0149: 23
ld H, (HL)                     ; 014A: 66
ld L, A                        ; 014B: 6F
pop AF                         ; 014C: F1
jp __zax_epilogue_0            ; 014D: C3 00 00
__zax_if_else_3:
ld HL, $0000                   ; 0150: 21 00 00
add HL, SP                     ; 0153: 39
push AF                        ; 0154: F5
ld A, (HL)                     ; 0155: 7E
inc HL                         ; 0156: 23
ld H, (HL)                     ; 0157: 66
ld L, A                        ; 0158: 6F
pop AF                         ; 0159: F1
ld HL, $0002                   ; 015A: 21 02 00
add HL, SP                     ; 015D: 39
ld a, (hl) ; inc hl ; ld d, (hl) ; ld e, a ; 015E: 7E 23 56 5F
add HL, DE                     ; 0162: 19
push HL                        ; 0163: E5
ld HL, $0008                   ; 0164: 21 08 00
add HL, SP                     ; 0167: 39
pop DE                         ; 0168: D1
ld (hl), e ; inc hl ; ld (hl), d ; 0169: 73 23 72
ld HL, $0002                   ; 016C: 21 02 00
add HL, SP                     ; 016F: 39
push AF                        ; 0170: F5
ld A, (HL)                     ; 0171: 7E
inc HL                         ; 0172: 23
ld H, (HL)                     ; 0173: 66
ld L, A                        ; 0174: 6F
pop AF                         ; 0175: F1
push HL                        ; 0176: E5
ld HL, $0002                   ; 0177: 21 02 00
add HL, SP                     ; 017A: 39
pop DE                         ; 017B: D1
ld (hl), e ; inc hl ; ld (hl), d ; 017C: 73 23 72
ld HL, $0006                   ; 017F: 21 06 00
add HL, SP                     ; 0182: 39
push AF                        ; 0183: F5
ld A, (HL)                     ; 0184: 7E
inc HL                         ; 0185: 23
ld H, (HL)                     ; 0186: 66
ld L, A                        ; 0187: 6F
pop AF                         ; 0188: F1
push HL                        ; 0189: E5
ld HL, $0004                   ; 018A: 21 04 00
add HL, SP                     ; 018D: 39
pop DE                         ; 018E: D1
ld (hl), e ; inc hl ; ld (hl), d ; 018F: 73 23 72
ld HL, $0004                   ; 0192: 21 04 00
add HL, SP                     ; 0195: 39
push AF                        ; 0196: F5
ld A, (HL)                     ; 0197: 7E
inc HL                         ; 0198: 23
ld H, (HL)                     ; 0199: 66
ld L, A                        ; 019A: 6F
pop AF                         ; 019B: F1
inc HL                         ; 019C: 23
push HL                        ; 019D: E5
ld HL, $0006                   ; 019E: 21 06 00
add HL, SP                     ; 01A1: 39
pop DE                         ; 01A2: D1
ld (hl), e ; inc hl ; ld (hl), d ; 01A3: 73 23 72
ld A, $0001                    ; 01A6: 3E 01
or A                           ; 01A8: B7
jp __zax_while_cond_1          ; 01A9: C3 00 00
__zax_while_end_2:
ld HL, $0000                   ; 01AC: 21 00 00
add HL, SP                     ; 01AF: 39
push AF                        ; 01B0: F5
ld A, (HL)                     ; 01B1: 7E
inc HL                         ; 01B2: 23
ld H, (HL)                     ; 01B3: 66
ld L, A                        ; 01B4: 6F
pop AF                         ; 01B5: F1
jp __zax_epilogue_0            ; 01B6: C3 00 00
__zax_epilogue_0:
pop BC                         ; 01B9: C1
pop BC                         ; 01BA: C1
pop BC                         ; 01BB: C1
pop BC                         ; 01BC: C1
ret                            ; 01BD: C9
; func fib end
; func main begin
main:
push AF                        ; 01BE: F5
push BC                        ; 01BF: C5
push DE                        ; 01C0: D5
push IX                        ; 01C1: DD E5
push IY                        ; 01C3: FD E5
ld HL, $000A                   ; 01C5: 21 0A 00
push HL                        ; 01C8: E5
call fib                       ; 01C9: CD 00 00
pop BC                         ; 01CC: C1
pop IY                         ; 01CD: FD E1
pop IX                         ; 01CF: DD E1
pop DE                         ; 01D1: D1
pop BC                         ; 01D2: C1
pop AF                         ; 01D3: F1
ret                            ; 01D4: C9
; func main end

; symbols:
; label fib = $0100
; label __zax_while_cond_1 = $0128
; label __zax_if_else_3 = $0150
; label __zax_while_end_2 = $01AC
; label __zax_epilogue_0 = $01B9
; label main = $01BE
