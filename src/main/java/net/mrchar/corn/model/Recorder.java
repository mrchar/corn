package net.mrchar.corn.model;

import jakarta.persistence.*;
import lombok.Getter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;

import java.time.ZonedDateTime;
import java.util.Set;
import java.util.UUID;

@Getter
@Entity
@Table(name = "recorder")
public class Recorder {
    @Id
    @Column(name = "id")
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne
    @JoinColumn(name = "category")
    private Category category;

    @ElementCollection
    @CollectionTable(name = "recorder_budget_label")
    private Set<Label> budgetLabels;

    @ManyToOne
    @JoinColumn(name = "space_id")
    private Space space;

    @ManyToOne
    @JoinColumn(name = "action_id")
    private Action action;

    @ElementCollection
    @CollectionTable(name = "recorder_action_label")
    private Set<Label> actionLabels;

    @Column(name = "config", columnDefinition = "LONGTEXT")
    private String config;

    @CreatedDate
    @Column(name = "created", columnDefinition = "TIMESTAMP")
    private ZonedDateTime created;

    @LastModifiedDate
    @Column(name = "modified", columnDefinition = "TIMESTAMP")
    private ZonedDateTime modified;
}
