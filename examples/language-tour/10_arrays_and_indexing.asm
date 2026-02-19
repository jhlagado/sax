; ZAX lowered .asm trace
; range: $0100..$0178 (end exclusive)

; func first_byte begin
first_byte:
push AF                        ; 0100: F5
push BC                        ; 0101: C5
push DE                        ; 0102: D5
ld A, (bytes10)                ; 0103: 3A 00 00
__zax_epilogue_0:
pop DE                         ; 0106: D1
pop BC                         ; 0107: C1
pop AF                         ; 0108: F1
ret                            ; 0109: C9
; func first_byte end
; func read_word_at begin
read_word_at:
push IX                        ; 010A: DD E5
ld IX, $0000                   ; 010C: DD 21 00 00
add IX, SP                     ; 0110: DD 39
push AF                        ; 0112: F5
push BC                        ; 0113: C5
push DE                        ; 0114: D5
ld e, (ix+disp)                ; 0115: DD 5E 04
ld d, (ix+disp+1)              ; 0118: DD 56 05
ex de, hl                      ; 011B: EB
push HL                        ; 011C: E5
pop HL                         ; 011D: E1
add HL, HL                     ; 011E: 29
push HL                        ; 011F: E5
ld HL, words4                  ; 0120: 21 00 00
pop DE                         ; 0123: D1
add HL, DE                     ; 0124: 19
push HL                        ; 0125: E5
pop HL                         ; 0126: E1
push AF                        ; 0127: F5
ld A, (HL)                     ; 0128: 7E
inc HL                         ; 0129: 23
ld H, (HL)                     ; 012A: 66
ld L, A                        ; 012B: 6F
pop AF                         ; 012C: F1
__zax_epilogue_1:
pop DE                         ; 012D: D1
pop BC                         ; 012E: C1
pop AF                         ; 012F: F1
ld SP, IX                      ; 0130: DD F9
pop IX                         ; 0132: DD E1
ret                            ; 0134: C9
; func main begin
; func read_word_at end
main:
push IX                        ; 0135: DD E5
ld IX, $0000                   ; 0137: DD 21 00 00
add IX, SP                     ; 013B: DD 39
push HL                        ; 013D: E5
ld HL, $0002                   ; 013E: 21 02 00
ex (SP), HL                    ; 0141: E3
push AF                        ; 0142: F5
push BC                        ; 0143: C5
push DE                        ; 0144: D5
push HL                        ; 0145: E5
call first_byte                ; 0146: CD 00 00
ld e, (ix+disp)                ; 0149: DD 5E FE
ld d, (ix+disp+1)              ; 014C: DD 56 FF
ex de, hl                      ; 014F: EB
push HL                        ; 0150: E5
call read_word_at              ; 0151: CD 00 00
inc SP                         ; 0154: 33
inc SP                         ; 0155: 33
__zax_epilogue_2:
pop HL                         ; 0156: E1
pop DE                         ; 0157: D1
pop BC                         ; 0158: C1
pop AF                         ; 0159: F1
ld SP, IX                      ; 015A: DD F9
pop IX                         ; 015C: DD E1
ret                            ; 015E: C9
; func main end

; symbols:
; label first_byte = $0100
; label __zax_epilogue_0 = $0106
; label read_word_at = $010A
; label __zax_epilogue_1 = $012D
; label main = $0135
; label __zax_epilogue_2 = $0156
; data bytes10 = $0160
; data words4 = $0170
