; ZAX lowered .asm trace
; range: $0100..$0186 (end exclusive)

; func first_byte begin
first_byte:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
ld A, (bytes10)                ; 010B: 3A 00 00
ld L, A                        ; 010E: 6F
ld H, $0000                    ; 010F: 26 00
__zax_epilogue_0:
pop DE                         ; 0111: D1
pop BC                         ; 0112: C1
pop AF                         ; 0113: F1
ld SP, IX                      ; 0114: DD F9
pop IX                         ; 0116: DD E1
ret                            ; 0118: C9
; func first_byte end
; func read_word_at begin
read_word_at:
push IX                        ; 0119: DD E5
ld IX, $0000                   ; 011B: DD 21 00 00
add IX, SP                     ; 011F: DD 39
push AF                        ; 0121: F5
push BC                        ; 0122: C5
push DE                        ; 0123: D5
ld e, (ix+disp)                ; 0124: DD 5E 04
ld d, (ix+disp+1)              ; 0127: DD 56 05
ex de, hl                      ; 012A: EB
push HL                        ; 012B: E5
pop HL                         ; 012C: E1
add HL, HL                     ; 012D: 29
push HL                        ; 012E: E5
ld HL, words4                  ; 012F: 21 00 00
pop DE                         ; 0132: D1
add HL, DE                     ; 0133: 19
push HL                        ; 0134: E5
pop HL                         ; 0135: E1
push AF                        ; 0136: F5
ld A, (HL)                     ; 0137: 7E
inc HL                         ; 0138: 23
ld H, (HL)                     ; 0139: 66
ld L, A                        ; 013A: 6F
pop AF                         ; 013B: F1
__zax_epilogue_1:
pop DE                         ; 013C: D1
pop BC                         ; 013D: C1
pop AF                         ; 013E: F1
ld SP, IX                      ; 013F: DD F9
pop IX                         ; 0141: DD E1
ret                            ; 0143: C9
; func main begin
; func read_word_at end
main:
push IX                        ; 0144: DD E5
ld IX, $0000                   ; 0146: DD 21 00 00
add IX, SP                     ; 014A: DD 39
push HL                        ; 014C: E5
ld HL, $0002                   ; 014D: 21 02 00
ex (SP), HL                    ; 0150: E3
push AF                        ; 0151: F5
push BC                        ; 0152: C5
push DE                        ; 0153: D5
push HL                        ; 0154: E5
call first_byte                ; 0155: CD 00 00
ld e, (ix+disp)                ; 0158: DD 5E FE
ld d, (ix+disp+1)              ; 015B: DD 56 FF
ex de, hl                      ; 015E: EB
push HL                        ; 015F: E5
call read_word_at              ; 0160: CD 00 00
inc SP                         ; 0163: 33
inc SP                         ; 0164: 33
__zax_epilogue_2:
pop HL                         ; 0165: E1
pop DE                         ; 0166: D1
pop BC                         ; 0167: C1
pop AF                         ; 0168: F1
ld SP, IX                      ; 0169: DD F9
pop IX                         ; 016B: DD E1
ret                            ; 016D: C9
; func main end

; symbols:
; label first_byte = $0100
; label __zax_epilogue_0 = $0111
; label read_word_at = $0119
; label __zax_epilogue_1 = $013C
; label main = $0144
; label __zax_epilogue_2 = $0165
; data bytes10 = $016E
; data words4 = $017E
