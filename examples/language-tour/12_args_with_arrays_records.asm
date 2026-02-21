; ZAX lowered .asm trace
; range: $0100..$0192 (end exclusive)

; func read_byte_at begin
read_byte_at:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
ld e, (ix+disp)                ; 010B: DD 5E 04
ld d, (ix+disp+1)              ; 010E: DD 56 05
ex de, hl                      ; 0111: EB
push HL                        ; 0112: E5
pop HL                         ; 0113: E1
push HL                        ; 0114: E5
ld HL, sample_bytes            ; 0115: 21 00 00
pop DE                         ; 0118: D1
add HL, DE                     ; 0119: 19
push HL                        ; 011A: E5
pop HL                         ; 011B: E1
ld A, (hl)                     ; 011C: 7E
ld L, A                        ; 011D: 6F
ld H, $0000                    ; 011E: 26 00
__zax_epilogue_0:
pop DE                         ; 0120: D1
pop BC                         ; 0121: C1
pop AF                         ; 0122: F1
ld SP, IX                      ; 0123: DD F9
pop IX                         ; 0125: DD E1
ret                            ; 0127: C9
; func read_byte_at end
; func read_word_at begin
read_word_at:
push IX                        ; 0128: DD E5
ld IX, $0000                   ; 012A: DD 21 00 00
add IX, SP                     ; 012E: DD 39
push AF                        ; 0130: F5
push BC                        ; 0131: C5
push DE                        ; 0132: D5
ld e, (ix+disp)                ; 0133: DD 5E 04
ld d, (ix+disp+1)              ; 0136: DD 56 05
ex de, hl                      ; 0139: EB
push HL                        ; 013A: E5
pop HL                         ; 013B: E1
add HL, HL                     ; 013C: 29
push HL                        ; 013D: E5
ld HL, sample_words            ; 013E: 21 00 00
pop DE                         ; 0141: D1
add HL, DE                     ; 0142: 19
push HL                        ; 0143: E5
pop HL                         ; 0144: E1
push AF                        ; 0145: F5
ld A, (HL)                     ; 0146: 7E
inc HL                         ; 0147: 23
ld H, (HL)                     ; 0148: 66
ld L, A                        ; 0149: 6F
pop AF                         ; 014A: F1
__zax_epilogue_1:
pop DE                         ; 014B: D1
pop BC                         ; 014C: C1
pop AF                         ; 014D: F1
ld SP, IX                      ; 014E: DD F9
pop IX                         ; 0150: DD E1
ret                            ; 0152: C9
; func main begin
; func read_word_at end
main:
push IX                        ; 0153: DD E5
ld IX, $0000                   ; 0155: DD 21 00 00
add IX, SP                     ; 0159: DD 39
push AF                        ; 015B: F5
push BC                        ; 015C: C5
push DE                        ; 015D: D5
push HL                        ; 015E: E5
ld HL, $0003                   ; 015F: 21 03 00
push HL                        ; 0162: E5
call read_byte_at              ; 0163: CD 00 00
inc SP                         ; 0166: 33
inc SP                         ; 0167: 33
ld HL, $0001                   ; 0168: 21 01 00
push HL                        ; 016B: E5
call read_word_at              ; 016C: CD 00 00
inc SP                         ; 016F: 33
inc SP                         ; 0170: 33
__zax_epilogue_2:
pop HL                         ; 0171: E1
pop DE                         ; 0172: D1
pop BC                         ; 0173: C1
pop AF                         ; 0174: F1
ld SP, IX                      ; 0175: DD F9
pop IX                         ; 0177: DD E1
ret                            ; 0179: C9
; func main end

; symbols:
; label read_byte_at = $0100
; label __zax_epilogue_0 = $0120
; label read_word_at = $0128
; label __zax_epilogue_1 = $014B
; label main = $0153
; label __zax_epilogue_2 = $0171
; data sample_bytes = $017A
; data sample_words = $018A
