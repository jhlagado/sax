; ZAX lowered .asm trace
; range: $0100..$0157 (end exclusive)

; func read_counter begin
read_counter:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
ld HL, (counter)               ; 010B: 2A 00 00
__zax_epilogue_0:
pop DE                         ; 010E: D1
pop BC                         ; 010F: C1
pop AF                         ; 0110: F1
ld SP, IX                      ; 0111: DD F9
pop IX                         ; 0113: DD E1
ret                            ; 0115: C9
; func read_counter end
; func write_counter begin
write_counter:
push IX                        ; 0116: DD E5
ld IX, $0000                   ; 0118: DD 21 00 00
add IX, SP                     ; 011C: DD 39
push AF                        ; 011E: F5
push BC                        ; 011F: C5
push DE                        ; 0120: D5
push HL                        ; 0121: E5
ex de, hl                      ; 0122: EB
ld e, (IX+$04)                 ; 0123: DD 5E 04
ld d, (IX+$05)                 ; 0126: DD 56 05
ex de, hl                      ; 0129: EB
ld (counter), HL               ; 012A: 22 00 00
__zax_epilogue_1:
pop HL                         ; 012D: E1
pop DE                         ; 012E: D1
pop BC                         ; 012F: C1
pop AF                         ; 0130: F1
ld SP, IX                      ; 0131: DD F9
pop IX                         ; 0133: DD E1
ret                            ; 0135: C9
; func main begin
; func write_counter end
main:
push IX                        ; 0136: DD E5
ld IX, $0000                   ; 0138: DD 21 00 00
add IX, SP                     ; 013C: DD 39
push AF                        ; 013E: F5
push BC                        ; 013F: C5
push DE                        ; 0140: D5
push HL                        ; 0141: E5
ld HL, $007B                   ; 0142: 21 7B 00
push HL                        ; 0145: E5
call write_counter             ; 0146: CD 00 00
inc SP                         ; 0149: 33
inc SP                         ; 014A: 33
ld HL, (counter)               ; 014B: 2A 00 00
__zax_epilogue_2:
pop HL                         ; 014E: E1
pop DE                         ; 014F: D1
pop BC                         ; 0150: C1
pop AF                         ; 0151: F1
ld SP, IX                      ; 0152: DD F9
pop IX                         ; 0154: DD E1
ret                            ; 0156: C9
; func main end

; symbols:
; label read_counter = $0100
; label __zax_epilogue_0 = $010E
; label write_counter = $0116
; label __zax_epilogue_1 = $012D
; label main = $0136
; label __zax_epilogue_2 = $014E
; var counter = $0158
