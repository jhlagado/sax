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
push DE                        ; 010B: D5
push IX                        ; 010C: DD E5
pop HL                         ; 010E: E1
ld DE, $0004                   ; 010F: 11 04 00
add HL, DE                     ; 0112: 19
pop DE                         ; 0113: D1
push HL                        ; 0114: E5
pop HL                         ; 0115: E1
ld a, (hl)                     ; 0116: 7E
inc HL                         ; 0117: 23
ld h, (hl) ; ld l, a           ; 0118: 66 6F
push HL                        ; 011A: E5
pop HL                         ; 011B: E1
push HL                        ; 011C: E5
ld HL, sample_bytes            ; 011D: 21 00 00
pop DE                         ; 0120: D1
add HL, DE                     ; 0121: 19
push HL                        ; 0122: E5
pop HL                         ; 0123: E1
ld A, (hl)                     ; 0124: 7E
__zax_epilogue_0:
pop DE                         ; 0125: D1
pop BC                         ; 0126: C1
pop AF                         ; 0127: F1
ld SP, IX                      ; 0128: DD F9
pop IX                         ; 012A: DD E1
ret                            ; 012C: C9
; func read_byte_at end
; func read_word_at begin
read_word_at:
push IX                        ; 012D: DD E5
ld IX, $0000                   ; 012F: DD 21 00 00
add IX, SP                     ; 0133: DD 39
push AF                        ; 0135: F5
push BC                        ; 0136: C5
push DE                        ; 0137: D5
push DE                        ; 0138: D5
push IX                        ; 0139: DD E5
pop HL                         ; 013B: E1
ld DE, $0004                   ; 013C: 11 04 00
add HL, DE                     ; 013F: 19
pop DE                         ; 0140: D1
push HL                        ; 0141: E5
pop HL                         ; 0142: E1
ld a, (hl)                     ; 0143: 7E
inc HL                         ; 0144: 23
ld h, (hl) ; ld l, a           ; 0145: 66 6F
push HL                        ; 0147: E5
pop HL                         ; 0148: E1
add HL, HL                     ; 0149: 29
push HL                        ; 014A: E5
ld HL, sample_words            ; 014B: 21 00 00
pop DE                         ; 014E: D1
add HL, DE                     ; 014F: 19
push HL                        ; 0150: E5
pop HL                         ; 0151: E1
push AF                        ; 0152: F5
ld A, (HL)                     ; 0153: 7E
inc HL                         ; 0154: 23
ld H, (HL)                     ; 0155: 66
ld L, A                        ; 0156: 6F
pop AF                         ; 0157: F1
__zax_epilogue_1:
pop DE                         ; 0158: D1
pop BC                         ; 0159: C1
pop AF                         ; 015A: F1
ld SP, IX                      ; 015B: DD F9
pop IX                         ; 015D: DD E1
ret                            ; 015F: C9
; func main begin
; func read_word_at end
main:
push AF                        ; 0160: F5
push BC                        ; 0161: C5
push DE                        ; 0162: D5
ld HL, $0003                   ; 0163: 21 03 00
push HL                        ; 0166: E5
call read_byte_at              ; 0167: CD 00 00
inc SP                         ; 016A: 33
inc SP                         ; 016B: 33
ld HL, $0001                   ; 016C: 21 01 00
push HL                        ; 016F: E5
call read_word_at              ; 0170: CD 00 00
inc SP                         ; 0173: 33
inc SP                         ; 0174: 33
__zax_epilogue_2:
pop DE                         ; 0175: D1
pop BC                         ; 0176: C1
pop AF                         ; 0177: F1
ret                            ; 0178: C9
; func main end

; symbols:
; label read_byte_at = $0100
; label __zax_epilogue_0 = $0125
; label read_word_at = $012D
; label __zax_epilogue_1 = $0158
; label main = $0160
; label __zax_epilogue_2 = $0175
; data sample_bytes = $017A
; data sample_words = $018A
