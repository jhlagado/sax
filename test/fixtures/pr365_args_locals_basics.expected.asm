; ZAX lowered .asm trace
; range: $0100..$018D (end exclusive)

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
ex de, hl                      ; 0131: EB
ld e, (IX+$04)                 ; 0132: DD 5E 04
ld d, $00                      ; 0135: 16 00
ex de, hl                      ; 0137: EB
ld H, $0000                    ; 0138: 26 00
inc L                          ; 013A: 2C
ex DE, HL                      ; 013B: EB
ld (IX - $0002), E             ; 013C: DD 73 FE
ld (IX - $0001), D             ; 013F: DD 72 FF
ex DE, HL                      ; 0142: EB
ex DE, HL                      ; 0143: EB
ld E, (IX - $0002)             ; 0144: DD 5E FE
ld D, (IX - $0001)             ; 0147: DD 56 FF
ex DE, HL                      ; 014A: EB
__zax_epilogue_1:
pop DE                         ; 014B: D1
pop BC                         ; 014C: C1
pop AF                         ; 014D: F1
ld SP, IX                      ; 014E: DD F9
pop IX                         ; 0150: DD E1
ret                            ; 0152: C9
; func bump_byte end
; func main begin
main:
push IX                        ; 0153: DD E5
ld IX, $0000                   ; 0155: DD 21 00 00
add IX, SP                     ; 0159: DD 39
push HL                        ; 015B: E5
ld HL, $0000                   ; 015C: 21 00 00
ex (SP), HL                    ; 015F: E3
push AF                        ; 0160: F5
push BC                        ; 0161: C5
push DE                        ; 0162: D5
push HL                        ; 0163: E5
ld HL, $0014                   ; 0164: 21 14 00
push HL                        ; 0167: E5
ld HL, $000A                   ; 0168: 21 0A 00
push HL                        ; 016B: E5
call add_words                 ; 016C: CD 00 00
inc SP                         ; 016F: 33
inc SP                         ; 0170: 33
inc SP                         ; 0171: 33
inc SP                         ; 0172: 33
ex DE, HL                      ; 0173: EB
ld (IX - $0002), E             ; 0174: DD 73 FE
ld (IX - $0001), D             ; 0177: DD 72 FF
ex DE, HL                      ; 017A: EB
ld HL, $0007                   ; 017B: 21 07 00
push HL                        ; 017E: E5
call bump_byte                 ; 017F: CD 00 00
inc SP                         ; 0182: 33
inc SP                         ; 0183: 33
__zax_epilogue_2:
pop HL                         ; 0184: E1
pop DE                         ; 0185: D1
pop BC                         ; 0186: C1
pop AF                         ; 0187: F1
ld SP, IX                      ; 0188: DD F9
pop IX                         ; 018A: DD E1
ret                            ; 018C: C9
; func main end

; symbols:
; label add_words = $0100
; label __zax_epilogue_0 = $011A
; label bump_byte = $0122
; label __zax_epilogue_1 = $014B
; label main = $0153
; label __zax_epilogue_2 = $0184
