; ZAX lowered .asm trace
; range: $0100..$0187 (end exclusive)

; func add_words begin
add_words:
ld HL, $0002                   ; 0100: 21 02 00
add HL, SP                     ; 0103: 39
push AF                        ; 0104: F5
ld A, (HL)                     ; 0105: 7E
inc HL                         ; 0106: 23
ld H, (HL)                     ; 0107: 66
ld L, A                        ; 0108: 6F
pop AF                         ; 0109: F1
ld HL, $0004                   ; 010A: 21 04 00
add HL, SP                     ; 010D: 39
ld a, (hl) ; inc hl ; ld d, (hl) ; ld e, a ; 010E: 7E 23 56 5F
add HL, DE                     ; 0112: 19
ret                            ; 0113: C9
; func add_words end
; func bump_byte begin
bump_byte:
push BC                        ; 0114: C5
ld HL, $0002                   ; 0115: 21 02 00
add HL, SP                     ; 0118: 39
ld (HL), $0000                 ; 0119: 36 00
inc HL                         ; 011B: 23
ld (HL), $0000                 ; 011C: 36 00
ld HL, $0004                   ; 011E: 21 04 00
add HL, SP                     ; 0121: 39
ld L, (hl)                     ; 0122: 6E
ld H, $0000                    ; 0123: 26 00
inc L                          ; 0125: 2C
push HL                        ; 0126: E5
ld HL, $0002                   ; 0127: 21 02 00
add HL, SP                     ; 012A: 39
pop DE                         ; 012B: D1
ld (hl), e ; inc hl ; ld (hl), d ; 012C: 73 23 72
ld HL, $0000                   ; 012F: 21 00 00
add HL, SP                     ; 0132: 39
push AF                        ; 0133: F5
ld A, (HL)                     ; 0134: 7E
inc HL                         ; 0135: 23
ld H, (HL)                     ; 0136: 66
ld L, A                        ; 0137: 6F
pop AF                         ; 0138: F1
jp __zax_epilogue_1            ; 0139: C3 00 00
__zax_epilogue_1:
pop BC                         ; 013C: C1
ret                            ; 013D: C9
; func bump_byte end
; func main begin
main:
push BC                        ; 013E: C5
ld HL, $0002                   ; 013F: 21 02 00
add HL, SP                     ; 0142: 39
ld (HL), $0000                 ; 0143: 36 00
inc HL                         ; 0145: 23
ld (HL), $0000                 ; 0146: 36 00
push AF                        ; 0148: F5
push BC                        ; 0149: C5
push DE                        ; 014A: D5
push IX                        ; 014B: DD E5
push IY                        ; 014D: FD E5
ld HL, $0014                   ; 014F: 21 14 00
push HL                        ; 0152: E5
ld HL, $000A                   ; 0153: 21 0A 00
push HL                        ; 0156: E5
call add_words                 ; 0157: CD 00 00
pop BC                         ; 015A: C1
pop BC                         ; 015B: C1
pop IY                         ; 015C: FD E1
pop IX                         ; 015E: DD E1
pop DE                         ; 0160: D1
pop BC                         ; 0161: C1
pop AF                         ; 0162: F1
push HL                        ; 0163: E5
ld HL, $0002                   ; 0164: 21 02 00
add HL, SP                     ; 0167: 39
pop DE                         ; 0168: D1
ld (hl), e ; inc hl ; ld (hl), d ; 0169: 73 23 72
push AF                        ; 016C: F5
push BC                        ; 016D: C5
push DE                        ; 016E: D5
push IX                        ; 016F: DD E5
push IY                        ; 0171: FD E5
ld HL, $0007                   ; 0173: 21 07 00
push HL                        ; 0176: E5
call bump_byte                 ; 0177: CD 00 00
pop BC                         ; 017A: C1
pop IY                         ; 017B: FD E1
pop IX                         ; 017D: DD E1
pop DE                         ; 017F: D1
pop BC                         ; 0180: C1
pop AF                         ; 0181: F1
jp __zax_epilogue_2            ; 0182: C3 00 00
__zax_epilogue_2:
pop BC                         ; 0185: C1
ret                            ; 0186: C9
; func main end

; symbols:
; label add_words = $0100
; label bump_byte = $0114
; label __zax_epilogue_1 = $013C
; label main = $013E
; label __zax_epilogue_2 = $0185
