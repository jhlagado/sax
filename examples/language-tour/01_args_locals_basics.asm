; ZAX lowered .asm trace
; range: $0100..$0191 (end exclusive)

; func add_words begin
add_words:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
ex DE, HL                      ; 010B: EB
ld E, (IX + $0004)             ; 010C: DD 5E 04
ld D, (IX + $0005)             ; 010F: DD 56 05
ex DE, HL                      ; 0112: EB
ld E, (IX + $0006)             ; 0113: DD 5E 06
ld D, (IX + $0007)             ; 0116: DD 56 07
add HL, DE                     ; 0119: 19
__zax_epilogue_0:
pop DE                         ; 011A: D1
pop BC                         ; 011B: C1
pop AF                         ; 011C: F1
ld SP, IX                      ; 011D: DD F9
pop IX                         ; 011F: DD E1
ret                            ; 0121: C9
; func add_words end
; func bump_byte begin
bump_byte:
push IX                        ; 0122: DD E5
ld IX, $0000                   ; 0124: DD 21 00 00
add IX, SP                     ; 0128: DD 39
ld HL, $0000                   ; 012A: 21 00 00
push HL                        ; 012D: E5
push AF                        ; 012E: F5
push BC                        ; 012F: C5
push DE                        ; 0130: D5
push DE                        ; 0131: D5
push IX                        ; 0132: DD E5
pop HL                         ; 0134: E1
ld DE, $0004                   ; 0135: 11 04 00
add HL, DE                     ; 0138: 19
push HL                        ; 0139: E5
pop DE                         ; 013A: D1
ld L, (hl)                     ; 013B: 6E
ld H, $0000                    ; 013C: 26 00
inc L                          ; 013E: 2C
ex DE, HL                      ; 013F: EB
ld (IX - $0002), E             ; 0140: DD 73 FE
ld (IX - $0001), D             ; 0143: DD 72 FF
ex DE, HL                      ; 0146: EB
ex DE, HL                      ; 0147: EB
ld E, (IX - $0002)             ; 0148: DD 5E FE
ld D, (IX - $0001)             ; 014B: DD 56 FF
ex DE, HL                      ; 014E: EB
__zax_epilogue_1:
pop DE                         ; 014F: D1
pop BC                         ; 0150: C1
pop AF                         ; 0151: F1
ld SP, IX                      ; 0152: DD F9
pop IX                         ; 0154: DD E1
ret                            ; 0156: C9
; func bump_byte end
; func main begin
main:
push IX                        ; 0157: DD E5
ld IX, $0000                   ; 0159: DD 21 00 00
add IX, SP                     ; 015D: DD 39
push HL                        ; 015F: E5
ld HL, $0000                   ; 0160: 21 00 00
ex (SP), HL                    ; 0163: E3
push AF                        ; 0164: F5
push BC                        ; 0165: C5
push DE                        ; 0166: D5
push HL                        ; 0167: E5
ld HL, $0014                   ; 0168: 21 14 00
push HL                        ; 016B: E5
ld HL, $000A                   ; 016C: 21 0A 00
push HL                        ; 016F: E5
call add_words                 ; 0170: CD 00 00
inc SP                         ; 0173: 33
inc SP                         ; 0174: 33
inc SP                         ; 0175: 33
inc SP                         ; 0176: 33
ex DE, HL                      ; 0177: EB
ld (IX - $0002), E             ; 0178: DD 73 FE
ld (IX - $0001), D             ; 017B: DD 72 FF
ex DE, HL                      ; 017E: EB
ld HL, $0007                   ; 017F: 21 07 00
push HL                        ; 0182: E5
call bump_byte                 ; 0183: CD 00 00
inc SP                         ; 0186: 33
inc SP                         ; 0187: 33
__zax_epilogue_2:
pop HL                         ; 0188: E1
pop DE                         ; 0189: D1
pop BC                         ; 018A: C1
pop AF                         ; 018B: F1
ld SP, IX                      ; 018C: DD F9
pop IX                         ; 018E: DD E1
ret                            ; 0190: C9
; func main end

; symbols:
; label add_words = $0100
; label __zax_epilogue_0 = $011A
; label bump_byte = $0122
; label __zax_epilogue_1 = $014F
; label main = $0157
; label __zax_epilogue_2 = $0188
