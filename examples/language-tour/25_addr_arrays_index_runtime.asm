; ZAX lowered .asm trace
; range: $0100..$01AC (end exclusive)

; func bump_at begin
bump_at:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
ld e, (IX+$04)                 ; 010B: DD 5E 04
ld d, (IX+$05)                 ; 010E: DD 56 05
ex de, hl                      ; 0111: EB
push HL                        ; 0112: E5
pop HL                         ; 0113: E1
add HL, HL                     ; 0114: 29
ex DE, HL                      ; 0115: EB
ld HL, arr_w                   ; 0116: 21 00 00
add HL, DE                     ; 0119: 19
push HL                        ; 011A: E5
pop HL                         ; 011B: E1
push AF                        ; 011C: F5
ld A, (HL)                     ; 011D: 7E
inc HL                         ; 011E: 23
ld H, (HL)                     ; 011F: 66
ld L, A                        ; 0120: 6F
pop AF                         ; 0121: F1
inc HL                         ; 0122: 23
push HL                        ; 0123: E5
ld e, (IX+$04)                 ; 0124: DD 5E 04
ld d, (IX+$05)                 ; 0127: DD 56 05
ex de, hl                      ; 012A: EB
push HL                        ; 012B: E5
pop HL                         ; 012C: E1
add HL, HL                     ; 012D: 29
ex DE, HL                      ; 012E: EB
ld HL, arr_w                   ; 012F: 21 00 00
add HL, DE                     ; 0132: 19
push HL                        ; 0133: E5
pop HL                         ; 0134: E1
pop DE                         ; 0135: D1
ld (hl), e ; inc hl ; ld (hl), d ; 0136: 73 23 72
ld e, (IX+$04)                 ; 0139: DD 5E 04
ld d, (IX+$05)                 ; 013C: DD 56 05
ex de, hl                      ; 013F: EB
push HL                        ; 0140: E5
pop HL                         ; 0141: E1
ex DE, HL                      ; 0142: EB
ld HL, arr_b                   ; 0143: 21 00 00
add HL, DE                     ; 0146: 19
push HL                        ; 0147: E5
pop HL                         ; 0148: E1
ld A, (hl)                     ; 0149: 7E
inc A                          ; 014A: 3C
push AF                        ; 014B: F5
ld e, (IX+$04)                 ; 014C: DD 5E 04
ld d, (IX+$05)                 ; 014F: DD 56 05
ex de, hl                      ; 0152: EB
push HL                        ; 0153: E5
pop HL                         ; 0154: E1
ex DE, HL                      ; 0155: EB
ld HL, arr_b                   ; 0156: 21 00 00
add HL, DE                     ; 0159: 19
push HL                        ; 015A: E5
pop HL                         ; 015B: E1
pop AF                         ; 015C: F1
ld (hl), A                     ; 015D: 77
ld e, (IX+$04)                 ; 015E: DD 5E 04
ld d, (IX+$05)                 ; 0161: DD 56 05
ex de, hl                      ; 0164: EB
push HL                        ; 0165: E5
pop HL                         ; 0166: E1
add HL, HL                     ; 0167: 29
ex DE, HL                      ; 0168: EB
ld HL, arr_w                   ; 0169: 21 00 00
add HL, DE                     ; 016C: 19
push HL                        ; 016D: E5
pop HL                         ; 016E: E1
push AF                        ; 016F: F5
ld A, (HL)                     ; 0170: 7E
inc HL                         ; 0171: 23
ld H, (HL)                     ; 0172: 66
ld L, A                        ; 0173: 6F
pop AF                         ; 0174: F1
__zax_epilogue_0:
pop DE                         ; 0175: D1
pop BC                         ; 0176: C1
pop AF                         ; 0177: F1
ld SP, IX                      ; 0178: DD F9
pop IX                         ; 017A: DD E1
ret                            ; 017C: C9
; func bump_at end
; func main begin
main:
push IX                        ; 017D: DD E5
ld IX, $0000                   ; 017F: DD 21 00 00
add IX, SP                     ; 0183: DD 39
push AF                        ; 0185: F5
push BC                        ; 0186: C5
push DE                        ; 0187: D5
push HL                        ; 0188: E5
ld HL, $0001                   ; 0189: 21 01 00
push HL                        ; 018C: E5
call bump_at                   ; 018D: CD 00 00
inc SP                         ; 0190: 33
inc SP                         ; 0191: 33
__zax_epilogue_1:
pop HL                         ; 0192: E1
pop DE                         ; 0193: D1
pop BC                         ; 0194: C1
pop AF                         ; 0195: F1
ld SP, IX                      ; 0196: DD F9
pop IX                         ; 0198: DD E1
ret                            ; 019A: C9
; func main end

; symbols:
; label bump_at = $0100
; label __zax_epilogue_0 = $0175
; label main = $017D
; label __zax_epilogue_1 = $0192
; data arr_b = $019C
; data arr_w = $01A4
